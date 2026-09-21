import "server-only";
import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";
import { getEnv } from "@cim/config";
import { createSession, getActiveSession, revokeSession, findUserById } from "@cim/db";
import { db } from "@cim/db";

const SESSION_COOKIE = "cim_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function sign(value: string): string {
  const mac = createHmac("sha256", getEnv().SESSION_SECRET).update(value).digest("hex");
  return `${value}.${mac}`;
}

function verify(signed: string): string | null {
  const separatorIndex = signed.lastIndexOf(".");
  if (separatorIndex === -1) return null;
  const value = signed.slice(0, separatorIndex);
  const mac = signed.slice(separatorIndex + 1);
  const expectedMac = createHmac("sha256", getEnv().SESSION_SECRET).update(value).digest("hex");
  const macBuffer = Buffer.from(mac, "hex");
  const expectedBuffer = Buffer.from(expectedMac, "hex");
  if (macBuffer.length !== expectedBuffer.length) return null;
  return timingSafeEqual(macBuffer, expectedBuffer) ? value : null;
}

/**
 * ADR-005: sessions are server-checked and revocable — the cookie is just
 * a signed pointer to a row in `sessions`, never the source of truth
 * itself. Every privileged action re-checks the DB row (expiry/revoked).
 */
export async function createUserSession(
  userId: string,
  meta: { userAgent?: string; ipAddress?: string } = {},
): Promise<void> {
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const session = await createSession(db, { userId, expiresAt, ...meta });
  const store = await cookies();
  store.set(SESSION_COOKIE, sign(session.id), {
    httpOnly: true,
    secure: getEnv().NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroyCurrentSession(): Promise<void> {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  const sessionId = raw ? verify(raw) : null;
  if (sessionId) await revokeSession(db, sessionId);
  store.delete(SESSION_COOKIE);
}

export type CurrentUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  emailVerifiedAt: Date | null;
  isPlatformSuperAdmin: boolean;
};

/** Resolves the session cookie to a verified, non-expired session and its
 * user — returns null for anything else (never throws for "no session",
 * that's a normal, expected state, not an error). */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  const sessionId = verify(raw);
  if (!sessionId) return null;

  const session = await getActiveSession(db, sessionId);
  if (!session) return null;

  const user = await findUserById(db, session.userId);
  if (!user) return null;

  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    emailVerifiedAt: user.emailVerifiedAt,
    isPlatformSuperAdmin: user.isPlatformSuperAdmin,
  };
}
