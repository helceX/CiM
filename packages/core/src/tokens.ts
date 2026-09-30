import { createHash, randomBytes } from "node:crypto";

/**
 * Verification/reset tokens: the raw token is only ever sent to the
 * user (email link); the database stores only its SHA-256 hash, so a DB
 * read alone never yields a usable token (same principle as password
 * hashing, applied to bearer tokens).
 */
export function generateRawToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}
