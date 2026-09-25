// AES-256-GCM for secrets at rest (the maintainer's GitHub token). The key is derived from
// SESSION_SECRET with HKDF-SHA256, so no second secret is needed. Format: v1.<iv>.<ct>.<tag>,
// each part base64url.
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

const INFO = "endcredits:seal:v1";
const IV_BYTES = 12;

function keyFrom(secret: string): Buffer {
  return Buffer.from(hkdfSync("sha256", secret, "", INFO, 32));
}

export function seal(plaintext: string, secret: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", keyFrom(secret), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const parts = [iv, ct, cipher.getAuthTag()].map((b) => b.toString("base64url"));
  return ["v1", ...parts].join(".");
}

export function unseal(sealed: string, secret: string): string {
  const [version, iv, ct, tag] = sealed.split(".");
  if (version !== "v1" || !iv || !ct || !tag) throw new Error("Malformed sealed value");
  const decipher = createDecipheriv("aes-256-gcm", keyFrom(secret), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  const out = Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]);
  return out.toString("utf8");
}
