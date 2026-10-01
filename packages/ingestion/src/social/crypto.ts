import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

/**
 * Social OAuth tokens are credentials to a customer's account: they are stored
 * encrypted (AES-256-GCM) and decrypted only inside the worker when a poll
 * needs them. The key comes from SOCIAL_TOKEN_ENCRYPTION_KEY when set; otherwise
 * it is derived from SESSION_SECRET (so nothing extra is required to start, but
 * rotating SESSION_SECRET then means customers reconnect their accounts).
 */
function keyFrom(secret: string): Buffer {
  return Buffer.from(hkdfSync("sha256", secret, "mediaory", "social-token-encryption", 32));
}

export function encryptSecret(plaintext: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFrom(secret), iv);
  const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), body.toString("base64url")].join(".");
}

/** Throws when the value was tampered with, or the key is not the one it was sealed with. */
export function decryptSecret(sealed: string, secret: string): string {
  const [version, iv, tag, body] = sealed.split(".");
  if (version !== "v1" || !iv || !tag || !body) throw new Error("Unrecognised secret format");
  const decipher = createDecipheriv("aes-256-gcm", keyFrom(secret), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
}

/** The secret material to seal with: a dedicated key if configured, else derived from the session secret. */
export function tokenSecretFromEnv(env: Record<string, string | undefined> = process.env): string {
  const secret = env.SOCIAL_TOKEN_ENCRYPTION_KEY || env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET (or SOCIAL_TOKEN_ENCRYPTION_KEY) is required to store social tokens");
  return secret;
}
