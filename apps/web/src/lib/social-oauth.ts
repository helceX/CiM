import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * The few seconds between "Connect" and the platform's redirect back need a
 * little memory: a random `state` (so a forged callback is rejected), the PKCE
 * verifier, and who started it. It lives in a short-lived, HttpOnly cookie
 * signed with SESSION_SECRET — nothing is stored server-side until the grant
 * succeeds.
 */
export const OAUTH_COOKIE = "mp_social_oauth";
export const OAUTH_COOKIE_MAX_AGE_SECONDS = 600;

export type OAuthTransaction = {
  platform: string;
  state: string;
  verifier: string;
  userId: string;
  organizationId: string;
  expiresAt: number;
};

const b64 = (buffer: Buffer) => buffer.toString("base64url");

export function newPkce(): { verifier: string; challenge: string } {
  const verifier = b64(randomBytes(48));
  return { verifier, challenge: b64(createHash("sha256").update(verifier).digest()) };
}

export function newState(): string {
  return b64(randomBytes(24));
}

function sign(payload: string, secret: string): string {
  return b64(createHmac("sha256", secret).update(payload).digest());
}

export function sealTransaction(transaction: OAuthTransaction, secret: string): string {
  const payload = b64(Buffer.from(JSON.stringify(transaction)));
  return `${payload}.${sign(payload, secret)}`;
}

/** Returns null for anything forged, malformed or past its expiry. */
export function openTransaction(value: string | undefined, secret: string, now = Date.now()): OAuthTransaction | null {
  if (!value) return null;
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload, secret));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const transaction = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as OAuthTransaction;
    return transaction.expiresAt > now ? transaction : null;
  } catch {
    return null;
  }
}

/** Where the platform sends the person back to. Built from APP_URL so it matches what was registered with the platform. */
export function callbackUrl(appUrl: string, platform: string): string {
  return `${appUrl.replace(/\/$/, "")}/api/social/callback/${platform}`;
}
