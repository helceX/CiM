import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { resetPasswordSchema } from "@cim/validation";
import { hashPassword, hashToken } from "@cim/core";
import { db, findUserById, schema } from "@cim/db";

export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = resetPasswordSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const tokenHash = hashToken(parsed.data.token);
  const [tokenRow] = await db
    .select()
    .from(schema.passwordResetTokens)
    .where(eq(schema.passwordResetTokens.tokenHash, tokenHash))
    .limit(1);

  if (
    !tokenRow ||
    tokenRow.consumedAt ||
    tokenRow.expiresAt.getTime() < Date.now()
  ) {
    return NextResponse.json({ error: "This link is invalid or has expired." }, { status: 400 });
  }

  // A reset token issued before the account was deleted must not still be
  // usable afterward — anonymizeUser's "deleted-account-no-login" sentinel
  // (packages/db privacy.ts) is a defense-in-depth invariant this route
  // would otherwise be able to overwrite with a real, working hash. Same
  // "a deleted user must never resolve to a usable identity" check
  // getCurrentUser applies to sessions (apps/web/src/lib/session.ts).
  const targetUser = await findUserById(db, tokenRow.userId);
  if (!targetUser || targetUser.deletedAt) {
    return NextResponse.json({ error: "This link is invalid or has expired." }, { status: 400 });
  }

  const passwordHash = await hashPassword(parsed.data.password);
  await db.transaction(async (tx) => {
    await tx
      .update(schema.users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(schema.users.id, tokenRow.userId));
    await tx
      .update(schema.passwordResetTokens)
      .set({ consumedAt: new Date() })
      .where(eq(schema.passwordResetTokens.id, tokenRow.id));
    // Invalidate every existing session — a password reset should not
    // leave old sessions (e.g. from a compromised credential) alive.
    await tx
      .update(schema.sessions)
      .set({ revokedAt: new Date() })
      .where(eq(schema.sessions.userId, tokenRow.userId));
  });

  return NextResponse.json({ ok: true });
}
