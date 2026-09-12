import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { discovery, verifyIdToken } from "@/lib/oidc";
import { sha256, randomToken } from "@/lib/crypto";
import { SESSION_HOURS } from "@/lib/session";

export async function GET(req: Request) {
  const jar = await cookies();
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const expected = jar.get("oidc_state")?.value;
  const nonce = jar.get("oidc_nonce")?.value;
  const verifier = jar.get("oidc_verifier")?.value;
  ["oidc_state", "oidc_nonce", "oidc_verifier"].forEach((c) => jar.delete(c));

  const fail = (e: string) =>
    NextResponse.redirect(new URL(`/login?e=${e}`, process.env.APP_URL));

  if (!code || !state || state !== expected || !nonce || !verifier) return fail("state");

  const doc = await discovery();
  const res = await fetch(doc.token_endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: process.env.OIDC_REDIRECT_URI!,
      client_id: process.env.OIDC_CLIENT_ID!,
      // Kein client_secret: Infomaniak Auth gibt für diese Anwendung einen
      // öffentlichen Client aus, es existiert kein Secret. Der Code ist
      // durch PKCE geschützt, der Verifier liegt in einem httpOnly-Cookie
      // und verlässt den Server nie.
      code_verifier: verifier,
    }),
  });
  if (!res.ok) {
    // Der Grund steht nur in der Antwort des IdP, etwa invalid_client bei
    // falschem Secret. Serverseitig protokollieren, im Browser bleibt es
    // bei einer allgemeinen Meldung.
    console.error(
      "OIDC Token-Tausch fehlgeschlagen:",
      res.status,
      await res.text(),
    );
    return fail("token");
  }

  const { id_token } = (await res.json()) as { id_token: string };
  const claims = await verifyIdToken(id_token, nonce);

  // Der IdP besitzt die Identität, IsoPilot nur die Berechtigung. Wer hier
  // ankommt, hat ein Konto der Organisation. Ob er etwas darf, entscheidet
  // die Freigabe durch einen Vorgesetzten.
  const ip = req.headers.get("x-forwarded-for") ?? undefined;
  const name = claims.name ?? claims.email ?? "Ohne Namen";
  const oidcEmail = claims.email?.toLowerCase();

  let user = await db.user.findUnique({ where: { oidcSub: claims.sub } });

  if (user) {
    // Name und Adresse können sich beim IdP geändert haben.
    if (user.name !== name || user.oidcEmail !== oidcEmail) {
      user = await db.user.update({
        where: { id: user.id },
        data: { name, oidcEmail },
      });
    }
  } else {
    const company = await db.company.findFirst({ orderBy: { createdAt: "asc" } });
    if (!company) return fail("setup");

    // Bootstrap: die allererste Person wird Vorgesetzter und ist frei, weil
    // es sonst niemanden gibt, der freigeben könnte.
    const istErste = (await db.user.count()) === 0;

    // Interaktive Transaktion, damit im Protokoll die User-ID steht und
    // nicht der oidcSub. Schreiben und Protokoll bleiben zusammen.
    user = await db.$transaction(async (tx) => {
      const neu = await tx.user.create({
        data: {
          companyId: company.id,
          name,
          oidcEmail,
          oidcSub: claims.sub,
          role: istErste ? "ADMIN" : "EMPLOYEE",
          isActive: istErste,
          vacationDays: company.defaultVacationDays,
        },
      });
      await tx.auditLog.create({
        data: {
          companyId: company.id,
          actorId: neu.id,
          action: istErste ? "USER_BOOTSTRAP" : "USER_SELF_CREATED",
          entity: "User",
          entityId: neu.id,
          ip,
        },
      });
      return neu;
    });
  }

  // Warteraum: das Konto existiert, darf aber noch nichts.
  if (!user.isActive) return fail("pending");

  const token = randomToken();
  await db.$transaction([
    db.session.create({
      data: {
        userId: user.id,
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + SESSION_HOURS * 3_600_000),
        mfaVerified: true, // der zweite Faktor lag beim IdP
        ip,
        userAgent: req.headers.get("user-agent") ?? undefined,
      },
    }),
    db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }),
    db.auditLog.create({
      data: {
        companyId: user.companyId, actorId: user.id,
        action: "LOGIN_OIDC", entity: "User", entityId: user.id,
        ip,
      },
    }),
  ]);

  jar.set("sid", token, {
    httpOnly: true, secure: true, sameSite: "lax", path: "/",
    maxAge: SESSION_HOURS * 3600,
  });
  return NextResponse.redirect(new URL("/", process.env.APP_URL));
}
