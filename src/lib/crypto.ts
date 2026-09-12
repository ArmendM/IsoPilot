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
