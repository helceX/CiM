import { and, eq, gt, isNull } from "drizzle-orm";
import type { Db } from "../client";
import {
  emailOutbox,
  emailVerificationTokens,
  passwordResetTokens,
  sessions,
} from "../schema/auth";

/** Auth primitives are global (pre-tenant-resolution), not organization-scoped. */

export async function createSession(
  db: Db,
  input: { userId: string; expiresAt: Date; userAgent?: string; ipAddress?: string },
) {
  const [session] = await db.insert(sessions).values(input).returning();
  if (!session) throw new Error("Failed to create session");
  return session;
}

export async function getActiveSession(db: Db, sessionId: string) {
  const [session] = await db
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.id, sessionId),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return session;
}

export async function revokeSession(db: Db, sessionId: string) {
  await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, sessionId));
}

/** Account deletion / anonymization must not leave any session still usable. */
export async function revokeAllSessionsForUser(db: Db, userId: string) {
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
}

export async function createEmailVerificationToken(
  db: Db,
  input: { userId: string; tokenHash: string; expiresAt: Date },
) {
  const [token] = await db.insert(emailVerificationTokens).values(input).returning();
  if (!token) throw new Error("Failed to create email verification token");
  return token;
}

export async function findValidVerificationTokenByHash(db: Db, tokenHash: string) {
  const [token] = await db
    .select()
    .from(emailVerificationTokens)
    .where(
      and(
        eq(emailVerificationTokens.tokenHash, tokenHash),
        isNull(emailVerificationTokens.consumedAt),
        gt(emailVerificationTokens.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return token;
}

export async function consumeVerificationToken(db: Db, tokenId: string) {
  await db
    .update(emailVerificationTokens)
    .set({ consumedAt: new Date() })
    .where(eq(emailVerificationTokens.id, tokenId));
}

export async function createPasswordResetToken(
  db: Db,
  input: { userId: string; tokenHash: string; expiresAt: Date },
) {
  const [token] = await db.insert(passwordResetTokens).values(input).returning();
  if (!token) throw new Error("Failed to create password reset token");
  return token;
}

export async function enqueueEmail(
  db: Db,
  input: { toEmail: string; subject: string; bodyText: string; kind: string },
) {
  const [email] = await db.insert(emailOutbox).values(input).returning();
  if (!email) throw new Error("Failed to enqueue email");
  return email;
}

export async function markEmailSent(db: Db, emailId: string) {
  await db.update(emailOutbox).set({ sentAt: new Date() }).where(eq(emailOutbox.id, emailId));
}

export async function getEmailById(db: Db, emailId: string) {
  const [email] = await db.select().from(emailOutbox).where(eq(emailOutbox.id, emailId)).limit(1);
  return email;
}
