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
