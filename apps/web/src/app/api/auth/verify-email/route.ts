import { NextResponse } from "next/server";
import { verifyEmailSchema } from "@cim/validation";
import { hashToken } from "@cim/core";
import {
  db,
  findUserById,
  findValidVerificationTokenByHash,
  consumeVerificationToken,
  markUserVerified,
} from "@cim/db";
import { createUserSession } from "@/lib/session";

export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = verifyEmailSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid or missing token" }, { status: 400 });
  }

  const tokenHash = hashToken(parsed.data.token);
  const tokenRow = await findValidVerificationTokenByHash(db, tokenHash);
  if (!tokenRow) {
    return NextResponse.json({ error: "This link is invalid or has expired." }, { status: 400 });
  }

  // A verification token issued before the account was deleted must not
  // still be usable afterward — same "a deleted user must never resolve
  // to a usable identity" invariant reset-password.ts enforces (and
  // getCurrentUser applies to sessions, apps/web/src/lib/session.ts).
  // Without this, a token that outlives a self-service account deletion
  // could still stamp emailVerifiedAt and mint a live session for an
  // anonymized row.
  const targetUser = await findUserById(db, tokenRow.userId);
  if (!targetUser || targetUser.deletedAt) {
    return NextResponse.json({ error: "This link is invalid or has expired." }, { status: 400 });
  }

  await consumeVerificationToken(db, tokenRow.id);
  await markUserVerified(db, tokenRow.userId);
  await createUserSession(tokenRow.userId, {
    userAgent: request.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ ok: true });
}
