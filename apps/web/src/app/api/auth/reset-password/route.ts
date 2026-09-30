import { NextResponse } from "next/server";
import { resetPasswordSchema } from "@cim/validation";
import { hashPassword, hashToken } from "@cim/core";
import { db, isPasswordResetTokenUsable, resetPasswordWithToken } from "@cim/db";

const INVALID_LINK = { error: "This link is invalid or has expired." };

export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = resetPasswordSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const tokenHash = hashToken(parsed.data.token);
  // Cheap early exit so an unknown/used/expired token doesn't cost a password
  // hash. This is only an optimisation: the authoritative check-and-consume is
  // the atomic claim inside resetPasswordWithToken.
  if (!(await isPasswordResetTokenUsable(db, tokenHash))) {
    return NextResponse.json(INVALID_LINK, { status: 400 });
  }

  const passwordHash = await hashPassword(parsed.data.password);
  // Covers, atomically: single use under concurrency, a deleted account never
  // getting a working hash back, revoking every session, and burning the
  // user's other outstanding reset links.
  const result = await resetPasswordWithToken(db, { tokenHash, passwordHash });
  if (!result.ok) {
    return NextResponse.json(INVALID_LINK, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
