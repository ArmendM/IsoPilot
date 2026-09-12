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
