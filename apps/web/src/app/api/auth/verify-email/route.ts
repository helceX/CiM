import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { verifyEmailSchema } from "@cim/validation";
import { hashToken } from "@cim/core";
import {
  db,
  findUserById,
  claimVerificationToken,
  markUserVerified,
} from "@cim/db";
import { createUserSession } from "@/lib/session";

export async function POST(request: Request) {
  const e = await getTranslations("errors");
  const json = await request.json().catch(() => null);
  const parsed = verifyEmailSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: e("missingToken") }, { status: 400 });
  }

  const tokenHash = hashToken(parsed.data.token);
  // Atomic check-and-consume: of two concurrent requests with one link only
  // one gets the token, so only one session is ever minted from it.
  const tokenRow = await claimVerificationToken(db, tokenHash);
  if (!tokenRow) {
    return NextResponse.json({ error: e("invalidLink") }, { status: 400 });
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
    return NextResponse.json({ error: e("invalidLink") }, { status: 400 });
  }

  await markUserVerified(db, tokenRow.userId);
  await createUserSession(tokenRow.userId, {
    userAgent: request.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ ok: true });
}
