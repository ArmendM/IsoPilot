#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════
# IsoPilot — Dateien anlegen, Teil 2: Anwendungscode
#
#   chmod +x scaffold-2-app.sh && ./scaffold-2-app.sh
#
# Voraussetzung: scaffold-1-infra.sh ist gelaufen und
# create-next-app hat das Grundgerüst angelegt.
# Legt nur an, was fehlt. Bestehende Dateien bleiben unberührt.
# ══════════════════════════════════════════════════════════════
set -euo pipefail

w() {
  if [ -e "$1" ]; then echo "  übersprungen: $1"; cat >/dev/null; return; fi
  mkdir -p "$(dirname "$1")"; cat > "$1"; echo "  angelegt: $1"
}

echo "IsoPilot Anwendungscode anlegen"

# ──────────────────────────────────────────────────────────────
w next.config.ts <<'EOF'
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Erzeugt ein schlankes Image für den Container
  output: "standalone",
  poweredByHeader: false,
  experimental: {
    // nginx setzt X-Forwarded-*, die App muss dem Host-Header trauen
    trustHostHeader: true,
  },
};

export default nextConfig;
EOF

# ──────────────────────────────────────────────────────────────
w src/lib/db.ts <<'EOF'
import { PrismaClient } from "@prisma/client";

// Ohne Singleton öffnet jeder Hot Reload neue Verbindungen,
// bis Postgres keine mehr annimmt.
const g = globalThis as unknown as { prisma?: PrismaClient };

export const db =
  g.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") g.prisma = db;
EOF

# ──────────────────────────────────────────────────────────────
w src/lib/dates.ts <<'EOF'
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { format, eachDayOfInterval, isWeekend } from "date-fns";

export const TZ = "Europe/Zurich";

/** Lokale Schweizer Eingabe in UTC umwandeln. Immer diese Funktion verwenden. */
export const zurichToUtc = (day: string, hhmm: string): Date =>
  fromZonedTime(`${day} ${hhmm}`, TZ);

/** UTC aus der Datenbank für die Anzeige in Schweizer Zeit. */
export const utcToZurich = (d: Date): Date => toZonedTime(d, TZ);

export const isoDate = (d: Date): string => format(utcToZurich(d), "yyyy-MM-dd");
export const todayISO = (): string => isoDate(new Date());
export const monthKey = (d: Date | string): string =>
  typeof d === "string" ? d.slice(0, 7) : isoDate(d).slice(0, 7);

export function monthRange(d: Date) {
  const z = utcToZurich(d);
  const from = new Date(Date.UTC(z.getFullYear(), z.getMonth(), 1));
  const to = new Date(Date.UTC(z.getFullYear(), z.getMonth() + 1, 0));
  return { from, to };
}

/** Nettostunden: Bruttozeit abzüglich Pause. */
export function netHours(
  start: Date | string,
  end: Date | string | null,
  breakMinutes = 0,
): number {
  if (!end) return 0;
  const a = new Date(start).getTime();
  const b = new Date(end).getTime();
  return Math.max(0, (b - a) / 3_600_000 - breakMinutes / 60);
}

export const formatHours = (h: number): string => {
  const m = Math.round(h * 60);
  return `${Math.floor(m / 60)}h ${m % 60}min`;
};

/** Arbeitstage ohne Wochenenden und ohne die übergebenen Feiertage. */
export function workingDays(
  from: Date,
  to: Date,
  holidays: Set<string> = new Set(),
): number {
  if (to < from) return 0;
  return eachDayOfInterval({ start: from, end: to }).filter(
    (d) => !isWeekend(d) && !holidays.has(isoDate(d)),
  ).length;
}
EOF

# ──────────────────────────────────────────────────────────────
w src/lib/money.ts <<'EOF'
import { Prisma } from "@prisma/client";

export type Money = Prisma.Decimal;
export const money = (v: number | string): Money => new Prisma.Decimal(v);

export const chf = (v: number | Money): string =>
  `Fr. ${Number(v).toFixed(2).replace(".", ",")}`;

export const VAT_RATE = 8.1;

/** Kleinmengenzuschlag, kumuliert je Baustelle und Artikel gerechnet. */
export function smallQtySurcharge(
  totalQty: number,
  threshold: number | null,
  surcharge: number | null,
): number {
  if (!threshold || !surcharge) return 0;
  return totalQty > 0 && totalQty < threshold ? surcharge : 0;
}

/** Prüfziffer nach Modulo 10 rekursiv, für die QR-Referenz. */
const T = [
  [0, 9, 4, 6, 8, 2, 7, 1, 3, 5], [9, 4, 6, 8, 2, 7, 1, 3, 5, 0],
  [4, 6, 8, 2, 7, 1, 3, 5, 0, 9], [6, 8, 2, 7, 1, 3, 5, 0, 9, 4],
  [8, 2, 7, 1, 3, 5, 0, 9, 4, 6], [2, 7, 1, 3, 5, 0, 9, 4, 6, 8],
  [7, 1, 3, 5, 0, 9, 4, 6, 8, 2], [1, 3, 5, 0, 9, 4, 6, 8, 2, 7],
  [3, 5, 0, 9, 4, 6, 8, 2, 7, 1], [5, 0, 9, 4, 6, 8, 2, 7, 1, 3],
];

export function qrReference(seed: string): string {
  const base = seed.replace(/\D/g, "").padStart(26, "0").slice(-26);
  let c = 0;
  for (const ch of base) c = T[c][Number(ch)];
  return base + ((10 - c) % 10);
}
EOF

# ──────────────────────────────────────────────────────────────
w src/lib/crypto.ts <<'EOF'
import { createHash, randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { hash as argonHash, verify as argonVerify } from "@node-rs/argon2";

// OWASP-Empfehlung: 19 MiB, 2 Durchgänge
const ARGON = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export const hashSecret = (plain: string) => argonHash(plain, ARGON);
export const verifySecret = (hash: string, plain: string) => argonVerify(hash, plain);

// Tokens sind zufällig und kurzlebig, ein langsamer Hash bringt dort nichts
export const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");
export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");

const key = () => Buffer.from(process.env.TOTP_ENC_KEY!, "base64");

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString("base64")).join(".");
}

export function decrypt(payload: string): string {
  const [iv, tag, enc] = payload.split(".").map((p) => Buffer.from(p, "base64"));
  const d = createDecipheriv("aes-256-gcm", key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
}
EOF

# ──────────────────────────────────────────────────────────────
w src/lib/oidc.ts <<'EOF'
import { createHash, randomBytes } from "node:crypto";
import { jwtVerify, createRemoteJWKSet } from "jose";

type Discovery = {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  end_session_endpoint?: string;
};

let cached: { doc: Discovery; at: number } | null = null;

/** Endpunkte nie hart verdrahten. Verschiebt der IdP etwas, merkst du es sonst
 *  erst, wenn sich niemand mehr anmelden kann. */
export async function discovery(): Promise<Discovery> {
  if (cached && Date.now() - cached.at < 3_600_000) return cached.doc;
  const res = await fetch(
    `${process.env.OIDC_ISSUER}/.well-known/openid-configuration`,
    { cache: "no-store" },
  );
  if (!res.ok) throw new Error(`OIDC Discovery fehlgeschlagen: ${res.status}`);
  const doc = (await res.json()) as Discovery;
  cached = { doc, at: Date.now() };
  return doc;
}

export const base64url = (b: Buffer) => b.toString("base64url");
export const randomString = (n = 32) => base64url(randomBytes(n));
export const pkceChallenge = (verifier: string) =>
  base64url(createHash("sha256").update(verifier).digest());

export async function verifyIdToken(idToken: string, nonce: string) {
  const doc = await discovery();
  const jwks = createRemoteJWKSet(new URL(doc.jwks_uri));
  const { payload } = await jwtVerify(idToken, jwks, {
    issuer: doc.issuer,
    audience: process.env.OIDC_CLIENT_ID,
  });
  if (payload.nonce !== nonce) throw new Error("NONCE_MISMATCH");
  return payload as { sub: string; email?: string; name?: string };
}
EOF

# ──────────────────────────────────────────────────────────────
w src/lib/session.ts <<'EOF'
import { cookies } from "next/headers";
import { cache } from "react";
import { db } from "@/lib/db";
import { sha256 } from "@/lib/crypto";

export type SessionUser = {
  id: string;
  companyId: string;
  name: string;
  role: "EMPLOYEE" | "ADMIN";
  vacationDays: number;
};

export const SESSION_HOURS = 12;

/** cache(): pro Request nur eine Abfrage, auch wenn zehn Komponenten fragen. */
export const getSession = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get("sid")?.value;
  if (!token) return null;

  const s = await db.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: true },
  });

  // mfaVerified ist entscheidend: nach dem ersten Schritt existiert bereits
  // eine Sitzung, die aber noch nichts darf.
  if (!s || s.expiresAt < new Date() || !s.mfaVerified || !s.user.isActive) return null;

  return {
    id: s.user.id,
    companyId: s.user.companyId,
    name: s.user.name,
    role: s.user.role,
    vacationDays: s.user.vacationDays,
  };
});

export async function requireUser(): Promise<SessionUser> {
  const u = await getSession();
  if (!u) throw new Error("UNAUTHENTICATED");
  return u;
}

export async function requireAdmin(): Promise<SessionUser> {
  const u = await requireUser();
  if (u.role !== "ADMIN") throw new Error("FORBIDDEN");
  return u;
}
EOF

# ──────────────────────────────────────────────────────────────
w src/lib/mail.ts <<'EOF'
import nodemailer from "nodemailer";
import { db } from "@/lib/db";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT ?? 587),
  secure: Number(process.env.SMTP_PORT) === 465,
  auth: process.env.SMTP_PASS
    ? { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASS! }
    : undefined,
  pool: true,
  maxConnections: 2,
  rateDelta: 60_000,
  rateLimit: 20,
});

type Attachment = { filename: string; content: Buffer; contentType?: string };

export async function sendMail(opts: {
  companyId: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: Attachment[];
  kind?: string;
  refId?: string;
}) {
  // Erst protokollieren, dann senden. Bricht der Prozess ab, weisst du
  // wenigstens, dass es einen Versuch gab.
  const log = await db.emailLog.create({
    data: {
      companyId: opts.companyId,
      to: opts.to,
      subject: opts.subject,
      kind: opts.kind ?? "system",
      refId: opts.refId,
    },
  });

  try {
    const info = await transporter.sendMail({
      from: process.env.MAIL_FROM,
      replyTo: process.env.MAIL_REPLY_TO,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
      attachments: opts.attachments,
    });
    await db.emailLog.update({
      where: { id: log.id },
      data: { status: "SENT", messageId: info.messageId, sentAt: new Date(), attempts: 1 },
    });
    return { ok: true as const, id: log.id };
  } catch (e) {
    await db.emailLog.update({
      where: { id: log.id },
      data: {
        status: "FAILED",
        error: e instanceof Error ? e.message.slice(0, 500) : "unbekannt",
        attempts: { increment: 1 },
      },
    });
    // Nicht werfen: eine Offerte darf nicht verloren gehen, nur weil der
    // Mailserver kurz nicht erreichbar war.
    return { ok: false as const, id: log.id };
  }
}
EOF

# ──────────────────────────────────────────────────────────────
w src/lib/holidays.ts <<'EOF'
import { db } from "@/lib/db";

type ApiHoliday = { startDate: string; name: { language: string; text: string }[] };

/** Nächtlich per Cron. Bestätigte Einträge werden nie überschrieben:
 *  der Mensch hat gegen die API recht. */
export async function syncHolidays() {
  const year = new Date().getFullYear();
  const sub = process.env.HOLIDAY_SUBDIVISION ?? "CH-LU";
  const url =
    `https://openholidaysapi.org/PublicHolidays?countryIsoCode=CH` +
    `&subdivisionCode=${sub}&languageIsoCode=DE` +
    `&validFrom=${year}-01-01&validTo=${year + 2}-12-31`;

  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`OpenHolidays ${res.status}`);
  const items = (await res.json()) as ApiHoliday[];

  const companies = await db.company.findMany({ select: { id: true } });
  let written = 0;

  for (const c of companies) {
    for (const h of items) {
      const name = h.name.find((n) => n.language === "DE")?.text ?? h.name[0].text;
      await db.holiday.upsert({
        where: {
          companyId_date_subdivision: {
            companyId: c.id,
            date: new Date(h.startDate),
            subdivision: sub,
          },
        },
        update: { name, source: "openholidays", fetchedAt: new Date() },
        create: {
          companyId: c.id,
          date: new Date(h.startDate),
          name,
          subdivision: sub,
          source: "openholidays",
        },
      });
      written++;
    }
  }
  return { written };
}

export async function holidaySet(companyId: string, from: Date, to: Date) {
  const rows = await db.holiday.findMany({
    where: { companyId, date: { gte: from, lte: to } },
    select: { date: true },
  });
  return new Set(rows.map((r) => r.date.toISOString().slice(0, 10)));
}
EOF

# ──────────────────────────────────────────────────────────────
w src/server/guards.ts <<'EOF'
import { db } from "@/lib/db";
import { monthKey } from "@/lib/dates";
import type { SessionUser } from "@/lib/session";

/** Der Monatsabschluss gilt auch für Vorgesetzte. Sonst ist er wertlos. */
export async function assertMonthOpen(companyId: string, date: Date) {
  const lock = await db.monthLock.findUnique({
    where: { companyId_month: { companyId, month: monthKey(date) } },
  });
  if (lock?.isLocked) throw new Error(`MONTH_LOCKED:${monthKey(date)}`);
}

/** Mitarbeitende nur eigene Daten, Vorgesetzte alle der eigenen Firma.
 *  Daut und Qail sehen einander ausdrücklich. */
export function assertOwnerOrAdmin(user: SessionUser, ownerId: string) {
  if (user.role !== "ADMIN" && user.id !== ownerId) throw new Error("FORBIDDEN");
}

export async function assertSameCompany(companyId: string, userId: string) {
  const t = await db.user.findUnique({ where: { id: userId } });
  if (!t || t.companyId !== companyId) throw new Error("FORBIDDEN");
}

/** Erlaubte Statuswechsel einer Baustelle. Kein freies Springen. */
export const NEXT_STATUS: Record<string, string[]> = {
  OFFERTE: ["AUFTRAG", "VERLOREN", "STORNIERT"],
  AUFTRAG: ["GEPLANT", "PAUSIERT", "STORNIERT"],
  GEPLANT: ["IN_ARBEIT", "AUFTRAG", "PAUSIERT", "STORNIERT"],
  IN_ARBEIT: ["AUSGEFUEHRT", "PAUSIERT"],
  AUSGEFUEHRT: ["VERRECHNET", "IN_ARBEIT"],
  VERRECHNET: ["ABGESCHLOSSEN", "AUSGEFUEHRT"],
  ABGESCHLOSSEN: [],
  VERLOREN: ["OFFERTE"],
  PAUSIERT: ["AUFTRAG", "GEPLANT", "IN_ARBEIT", "STORNIERT"],
  STORNIERT: [],
};

const LINE = ["OFFERTE","AUFTRAG","GEPLANT","IN_ARBEIT","AUSGEFUEHRT","VERRECHNET","ABGESCHLOSSEN"];

/** Rückschritte und Abbrüche verlangen eine Begründung. */
export function needsReason(from: string, to: string): boolean {
  if (["VERLOREN", "STORNIERT", "PAUSIERT"].includes(to)) return true;
  const a = LINE.indexOf(from), b = LINE.indexOf(to);
  return a >= 0 && b >= 0 && b < a;
}

export function assertTransition(from: string, to: string, reason?: string) {
  if (!(NEXT_STATUS[from] ?? []).includes(to)) throw new Error("BAD_TRANSITION");
  if (needsReason(from, to) && !reason?.trim()) throw new Error("REASON_REQUIRED");
}

/** Zeit buchen ab Auftrag, Material bereits in der Offertphase. */
export const canBookTime = (s: string) => ["AUFTRAG", "GEPLANT", "IN_ARBEIT"].includes(s);
export const canBookMaterial = (s: string) =>
  ["OFFERTE", "AUFTRAG", "GEPLANT", "IN_ARBEIT", "AUSGEFUEHRT"].includes(s);
EOF

# ──────────────────────────────────────────────────────────────
w src/server/time-entries.ts <<'EOF'
"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { zurichToUtc } from "@/lib/dates";
import { assertMonthOpen, assertOwnerOrAdmin, assertSameCompany } from "./guards";

const Input = z.object({
  id: z.string().optional(),
  userId: z.string(),
  workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start: z.string().regex(/^\d{2}:\d{2}$/),
  end: z.string().regex(/^\d{2}:\d{2}$/),
  breakMinutes: z.number().int().min(0).max(480),
  siteId: z.string().nullable(),
  isRegie: z.boolean().default(false),
  note: z.string().max(500).nullable(),
});

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function saveTimeEntry(raw: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = Input.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Ungültige Eingabe." };
  const i = parsed.data;

  try {
    assertOwnerOrAdmin(user, i.userId);
    await assertSameCompany(user.companyId, i.userId);
    // Nur Vorgesetzte entscheiden über Regie
    if (i.isRegie && user.role !== "ADMIN") return { ok: false, error: "Keine Berechtigung." };

    const workDate = new Date(`${i.workDate}T00:00:00Z`);
    await assertMonthOpen(user.companyId, workDate);

    const startedAt = zurichToUtc(i.workDate, i.start);
    const endedAt = zurichToUtc(i.workDate, i.end);
    if (endedAt <= startedAt) return { ok: false, error: "Die Endzeit muss nach der Startzeit liegen." };
    if ((+endedAt - +startedAt) / 3_600_000 - i.breakMinutes / 60 <= 0)
      return { ok: false, error: "Die Pause ist länger als die Arbeitszeit." };

    // Mehrere Einträge pro Tag sind erlaubt, Überschneidungen nicht
    const clash = await db.timeEntry.findFirst({
      where: {
        userId: i.userId, workDate, deletedAt: null,
        id: i.id ? { not: i.id } : undefined,
        startedAt: { lt: endedAt }, endedAt: { gt: startedAt },
      },
    });
    if (clash) return { ok: false, error: "Überschneidet sich mit einem bestehenden Eintrag." };

    const data = {
      userId: i.userId, siteId: i.siteId, workDate, startedAt, endedAt,
      breakMinutes: i.breakMinutes, note: i.note,
      billingMode: i.isRegie ? ("REGIE" as const) : ("PAUSCHAL" as const),
      source: "MANUAL" as const, createdById: user.id,
    };

    // Schreiben und Protokollieren in einer Transaktion: es darf keine
    // Änderung ohne Protokolleintrag geben.
    await db.$transaction(async (tx) => {
      const before = i.id ? await tx.timeEntry.findUnique({ where: { id: i.id } }) : null;
      if (before) await assertMonthOpen(user.companyId, before.workDate);

      const after = i.id
        ? await tx.timeEntry.update({ where: { id: i.id }, data })
        : await tx.timeEntry.create({ data });

      await tx.auditLog.create({
        data: {
          companyId: user.companyId, actorId: user.id,
          action: before ? "UPDATE" : "CREATE",
          entity: "TimeEntry", entityId: after.id,
          before: before ? JSON.parse(JSON.stringify(before)) : undefined,
          after: JSON.parse(JSON.stringify(after)),
        },
      });
    });

    revalidatePath("/");
    revalidatePath("/zeiten");
    return { ok: true };
  } catch (e) {
    const m = e instanceof Error ? e.message : "";
    if (m.startsWith("MONTH_LOCKED")) return { ok: false, error: "Dieser Monat ist abgeschlossen." };
    if (m === "FORBIDDEN") return { ok: false, error: "Keine Berechtigung." };
    console.error(e);
    return { ok: false, error: "Speichern fehlgeschlagen." };
  }
}
EOF

# ──────────────────────────────────────────────────────────────
w src/app/api/health/route.ts <<'EOF'
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, db: "up" });
  } catch {
    return NextResponse.json({ ok: false, db: "down" }, { status: 503 });
  }
}
EOF

# ──────────────────────────────────────────────────────────────
w src/app/api/auth/login/route.ts <<'EOF'
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { discovery, pkceChallenge, randomString } from "@/lib/oidc";

export async function GET() {
  const doc = await discovery();
  const state = randomString();
  const nonce = randomString();
  const verifier = randomString(48);

  const jar = await cookies();
  const o = { httpOnly: true, secure: true, sameSite: "lax" as const, maxAge: 600, path: "/" };
  jar.set("oidc_state", state, o);
  jar.set("oidc_nonce", nonce, o);
  jar.set("oidc_verifier", verifier, o);

  const url = new URL(doc.authorization_endpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", process.env.OIDC_CLIENT_ID!);
  url.searchParams.set("redirect_uri", process.env.OIDC_REDIRECT_URI!);
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("nonce", nonce);
  url.searchParams.set("code_challenge", pkceChallenge(verifier));
  url.searchParams.set("code_challenge_method", "S256");

  return NextResponse.redirect(url);
}
EOF

# ──────────────────────────────────────────────────────────────
w src/app/api/auth/callback/route.ts <<'EOF'
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
      client_secret: process.env.OIDC_CLIENT_SECRET!,
      code_verifier: verifier,
    }),
  });
  if (!res.ok) return fail("token");

  const { id_token } = (await res.json()) as { id_token: string };
  const claims = await verifyIdToken(id_token, nonce);

  // Kein Selbstregistrieren: ein gültiges Infomaniak-Konto genügt nicht.
  const user =
    (await db.user.findUnique({ where: { oidcSub: claims.sub } })) ??
    (claims.email
      ? await db.user.findUnique({ where: { email: claims.email.toLowerCase() } })
      : null);

  if (!user || !user.isActive) return fail("unknown");

  // Ab dem ersten Login zählt sub, nicht die Mailadresse. Adressen ändern sich.
  if (!user.oidcSub) {
    await db.user.update({
      where: { id: user.id },
      data: { oidcSub: claims.sub, oidcEmail: claims.email?.toLowerCase() },
    });
  }

  const token = randomToken();
  await db.$transaction([
    db.session.create({
      data: {
        userId: user.id,
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + SESSION_HOURS * 3_600_000),
        mfaVerified: true, // der zweite Faktor lag beim IdP
        ip: req.headers.get("x-forwarded-for") ?? undefined,
        userAgent: req.headers.get("user-agent") ?? undefined,
      },
    }),
    db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }),
    db.auditLog.create({
      data: {
        companyId: user.companyId, actorId: user.id,
        action: "LOGIN_OIDC", entity: "User", entityId: user.id,
        ip: req.headers.get("x-forwarded-for") ?? undefined,
      },
    }),
  ]);

  jar.set("sid", token, {
    httpOnly: true, secure: true, sameSite: "lax", path: "/",
    maxAge: SESSION_HOURS * 3600,
  });
  return NextResponse.redirect(new URL("/", process.env.APP_URL));
}
EOF

# ──────────────────────────────────────────────────────────────
w src/app/api/auth/logout/route.ts <<'EOF'
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { sha256 } from "@/lib/crypto";

export async function POST() {
  const jar = await cookies();
  const token = jar.get("sid")?.value;
  if (token) await db.session.deleteMany({ where: { tokenHash: sha256(token) } });
  jar.delete("sid");
  return NextResponse.redirect(new URL("/login", process.env.APP_URL));
}
EOF

# ──────────────────────────────────────────────────────────────
w "src/app/api/cron/[job]/route.ts" <<'EOF'
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { syncHolidays } from "@/lib/holidays";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ job: string }> },
) {
  if (req.headers.get("x-cron-secret") !== process.env.CRON_SECRET) {
    return new NextResponse("forbidden", { status: 403 });
  }
  const { job } = await params;

  switch (job) {
    case "holidays":
      return NextResponse.json(await syncHolidays());
    case "retention":
      return NextResponse.json(await applyRetention());
    case "sessions":
      return NextResponse.json(
        await db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } }),
      );
    default:
      return new NextResponse("unknown job", { status: 404 });
  }
}

/** 10 Jahre für Zeitdaten, 18 Monate für Krankheitsnotizen. */
async function applyRetention() {
  const today = new Date();
  const [entries, notes] = await db.$transaction([
    db.timeEntry.deleteMany({ where: { deleteAfter: { lt: today } } }),
    db.absence.updateMany({
      where: { type: "SICK", noteClearAt: { lt: today }, note: { not: null } },
      data: { note: null, noteClearAt: null },
    }),
  ]);
  return { deletedEntries: entries.count, clearedNotes: notes.count };
}
EOF

# ──────────────────────────────────────────────────────────────
w src/middleware.ts <<'EOF'
import { NextResponse, type NextRequest } from "next/server";

// Grobfilter: ohne Cookie gar nicht erst in die App. Die eigentliche Prüfung
// passiert in getSession(), weil die Middleware keine Datenbank sieht.
const PUBLIC = ["/login", "/api/auth", "/api/health", "/_next", "/favicon.ico"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname.startsWith(p))) return NextResponse.next();

  if (!req.cookies.get("sid")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
EOF

# ──────────────────────────────────────────────────────────────
w prisma/seed.ts <<'EOF'
/**
 * Stammdaten für IsoPilot.
 * Ausführen: npm run db:seed
 *
 * Enthält bewusst keine Zeiteinträge. Echte Stunden entstehen im Betrieb.
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const company = await db.company.upsert({
    where: { id: "isoteam" },
    update: {},
    create: {
      id: "isoteam",
      name: "IsoTeam Suljejmani GmbH",
      street: "Gerliswilstrasse 68",
      zip: "6020",
      city: "Emmenbrücke",
      vatNumber: "CHE-190.604.537",
      phone: "079 616 89 75",
      email: "isoteam.daut@gmail.com",
      canton: "LU",
      defaultVacationDays: 25,
      // Regietarife gemäss Preisliste 01.01.2024
      regieRateA: 84,
      regieRateB: 76,
      // QR-IBAN vor dem ersten Rechnungsversand eintragen
      iban: null,
    },
  });

  const people = [
    { name: "Daut", email: "daut@isoteam-suljejmani.ch", role: "ADMIN" as const },
    { name: "Qail", email: "qail@isoteam-suljejmani.ch", role: "ADMIN" as const },
    { name: "Liridon", email: "liridon@isoteam-suljejmani.ch", role: "EMPLOYEE" as const },
    { name: "Islom", email: "islom@isoteam-suljejmani.ch", role: "EMPLOYEE" as const },
  ];
  for (const p of people) {
    await db.user.upsert({
      where: { email: p.email },
      update: {},
      create: { ...p, companyId: company.id, vacationDays: 25, regieTariff: "A" },
    });
  }

  const partners = [
    { name: "Flüma Klima AG", street: "Industriestrasse 8", zip: "6031", city: "Ebikon",
      phone: "041 445 68 28", website: "fluema.ch" },
    { name: "Air Five AG", street: "Parkstrasse 1a", zip: "6214", city: "Schenkon",
      phone: "041 700 49 60", website: "air-five.ch" },
  ];
  for (const p of partners) {
    await db.partner.upsert({
      where: { companyId_name: { companyId: company.id, name: p.name } },
      update: {},
      create: { ...p, companyId: company.id },
    });
  }

  // Preisliste Stand 01.01.2024. Kleinmengenzuschlag unter 30 m2.
  const cats = ["Thermische Dämmung", "Synthetischer Kautschuk", "Brandschutzdämmung",
                "Alublech-Verkleidung", "Brandabschottung Weichschott"];
  const catIds: Record<string, string> = {};
  for (const [i, name] of cats.entries()) {
    const c = await db.category.upsert({
      where: { companyId_name: { companyId: company.id, name } },
      update: {},
      create: { companyId: company.id, name, sortOrder: i },
    });
    catIds[name] = c.id;
  }

  const mats = [
    ["TH-20","Thermische Dämmung","Thermisch 20mm (Paroc/Flumroc)","M2",25,null],
    ["TH-30","Thermische Dämmung","Thermisch 30mm (Paroc/Flumroc)","M2",27,null],
    ["TH-40","Thermische Dämmung","Thermisch 40mm (Paroc/Flumroc)","M2",30,null],
    ["TH-50","Thermische Dämmung","Thermisch 50mm (Paroc/Flumroc)","M2",34,null],
    ["TH-60","Thermische Dämmung","Thermisch 60mm (Paroc/Flumroc)","M2",36,null],
    ["TH-100","Thermische Dämmung","Thermisch 100mm (Paroc/Flumroc)","M2",48,null],
    ["AF-13","Synthetischer Kautschuk","Armaflex XG 13mm","M2",49,null],
    ["AF-19","Synthetischer Kautschuk","Armaflex XG 19mm","M2",58,null],
    ["AF-25","Synthetischer Kautschuk","Armaflex XG 25mm","M2",66,null],
    ["AF-32","Synthetischer Kautschuk","Armaflex XG 32mm","M2",78,null],
    ["AF-40","Synthetischer Kautschuk","Armaflex XG 40mm","M2",86,null],
    ["AF-50","Synthetischer Kautschuk","Armaflex XG 50mm","M2",91,null],
    ["FMI30-50","Brandschutzdämmung","Flumroc FMI 500 FP 50mm","M2",56,"EI 30"],
    ["FMI60-80","Brandschutzdämmung","Flumroc FMI 500 FP 80mm","M2",70,"EI 60"],
    ["FMI60-100","Brandschutzdämmung","Flumroc FMI 500 FP 100mm","M2",88,"EI 60"],
    ["CD30-60","Brandschutzdämmung","Conlit Ductbord 30 LW 60mm","M2",54,"EI 30"],
    ["CD30-100","Brandschutzdämmung","Conlit Ductbord 30 LW 100mm","M2",73,"EI 30"],
    ["CD60-60","Brandschutzdämmung","Conlit Ductbord 60 LW 60mm","M2",64,"EI 60"],
    ["CD60-100","Brandschutzdämmung","Conlit Ductbord 60 LW 100mm","M2",88,"EI 60"],
    ["CD90-80","Brandschutzdämmung","Conlit Ductbord 90 80mm","M2",80,"EI 90"],
    ["ALU-GS","Alublech-Verkleidung","Aluminium halbhart, glatt oder stucco","M2",85,null],
    ["WS-100","Brandabschottung Weichschott","Weichschott bis 100 cm2","STK",75,"VKF"],
    ["WS-500","Brandabschottung Weichschott","Weichschott 101-500 cm2","STK",144,"VKF"],
    ["WS-1000","Brandabschottung Weichschott","Weichschott 501-1000 cm2","STK",185,"VKF"],
    ["WS-2000","Brandabschottung Weichschott","Weichschott 1001-2000 cm2","STK",228,"VKF"],
    ["WS-4000","Brandabschottung Weichschott","Weichschott 2001-4000 cm2","STK",304,"VKF"],
    ["WS-6000","Brandabschottung Weichschott","Weichschott 4001-6000 cm2","STK",405,"VKF"],
    ["WS-8000","Brandabschottung Weichschott","Weichschott 6001-8000 cm2","STK",495,"VKF"],
    ["WS-10000","Brandabschottung Weichschott","Weichschott 8001-10000 cm2","STK",558,"VKF"],
  ] as const;

  for (const [sku, cat, name, unit, price, fire] of mats) {
    const alu = sku === "ALU-GS";
    await db.material.upsert({
      where: { companyId_sku: { companyId: company.id, sku } },
      update: { price },
      create: {
        companyId: company.id, categoryId: catIds[cat], sku, name,
        unit: unit as never, price,
        fireClass: fire ?? undefined,
        smallQtyThreshold: unit === "M2" ? 30 : null,
        smallQtySurcharge: unit === "M2" ? (alu ? 5 : 2) : null,
      },
    });
  }

  console.log("Seed fertig: Firma, 4 Personen, 2 Partner, 29 Artikel");
  console.log("Offen: QR-IBAN eintragen, VSI-Tarife importieren");
}

main().finally(() => db.$disconnect());
EOF

# ──────────────────────────────────────────────────────────────
echo
echo "Fertig. Noch von Hand einsetzen:"
echo "  prisma/schema.prisma   aus dem Artefakt «IsoPilot — prisma/schema.prisma»"
echo "  CLAUDE.md              aus dem Artefakt «CLAUDE.md für das Repo»"
echo "  docs/LEBENSZYKLUS.md   aus dem Artefakt «docs/LEBENSZYKLUS.md»"
echo
echo "Das Schema braucht zusätzlich die Felder aus M6 und M7:"
echo "  Company: regieRateA, regieRateB, regieValidFrom, iban"
echo "  User:    regieTariff"
echo "  Material: fireClass, smallQtyThreshold, smallQtySurcharge"
echo "  Site:    status, statusLog, plannedStart, plannedEnd, deadline,"
echo "           deadlineLog, assignees"
echo "  Neu:     Offer, OfferLine, Invoice, InvoiceLine, Payment"
echo
echo "Danach:"
echo "  npm i nodemailer jose date-fns date-fns-tz && npm i -D @types/nodemailer"
echo "  npx prisma migrate dev --name init && npm run db:seed"
