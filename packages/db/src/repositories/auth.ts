import { and, eq, gt, isNull } from "drizzle-orm";
import { users } from "../schema/users";
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

/**
 * Single-use means single-use even under concurrency: the check and the
 * consume are ONE conditional UPDATE, so of two simultaneous requests with
 * the same token exactly one gets the row back and the other gets nothing.
 * (A separate SELECT-then-UPDATE let both through.)
 */
export async function claimVerificationToken(db: Db, tokenHash: string) {
  const [token] = await db
    .update(emailVerificationTokens)
    .set({ consumedAt: new Date() })
    .where(
      and(
        eq(emailVerificationTokens.tokenHash, tokenHash),
        isNull(emailVerificationTokens.consumedAt),
        gt(emailVerificationTokens.expiresAt, new Date()),
      ),
    )
    .returning();
  return token;
}

/** Cheap read used to reject obviously bad tokens before paying for a password hash. */
export async function isPasswordResetTokenUsable(db: Db, tokenHash: string): Promise<boolean> {
  const [token] = await db
    .select({ id: passwordResetTokens.id })
    .from(passwordResetTokens)
    .where(
      and(
        eq(passwordResetTokens.tokenHash, tokenHash),
        isNull(passwordResetTokens.consumedAt),
        gt(passwordResetTokens.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return token !== undefined;
}

export type ResetPasswordResult = { ok: true; userId: string } | { ok: false };

/**
 * Consumes a reset token and sets the new password in one transaction. The
 * token is claimed atomically (only one concurrent caller can win), a token
 * whose account was deleted never overwrites the anonymisation sentinel, all
 * of the user's sessions are revoked, and every other outstanding reset
 * token for the user is burned too — a newer reset must not leave an older
 * emailed link usable.
 */
export async function resetPasswordWithToken(
  db: Db,
  input: { tokenHash: string; passwordHash: string },
): Promise<ResetPasswordResult> {
  return db.transaction(async (tx) => {
    const now = new Date();
    const [claimed] = await tx
      .update(passwordResetTokens)
      .set({ consumedAt: now })
      .where(
        and(
          eq(passwordResetTokens.tokenHash, input.tokenHash),
          isNull(passwordResetTokens.consumedAt),
          gt(passwordResetTokens.expiresAt, now),
        ),
      )
      .returning();
    if (!claimed) return { ok: false } as const;

    const [user] = await tx.select().from(users).where(eq(users.id, claimed.userId)).limit(1);
    if (!user || user.deletedAt) return { ok: false } as const;

    await tx
      .update(users)
      .set({ passwordHash: input.passwordHash, updatedAt: now })
      .where(eq(users.id, claimed.userId));
    await tx
      .update(sessions)
      .set({ revokedAt: now })
      .where(and(eq(sessions.userId, claimed.userId), isNull(sessions.revokedAt)));
    await tx
      .update(passwordResetTokens)
      .set({ consumedAt: now })
      .where(and(eq(passwordResetTokens.userId, claimed.userId), isNull(passwordResetTokens.consumedAt)));
    return { ok: true, userId: claimed.userId } as const;
  });
}
