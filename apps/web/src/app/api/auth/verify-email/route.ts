import { NextResponse } from "next/server";
import { verifyEmailSchema } from "@cim/validation";
import { hashToken } from "@cim/core";
import {
  db,
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

  await consumeVerificationToken(db, tokenRow.id);
  await markUserVerified(db, tokenRow.userId);
  await createUserSession(tokenRow.userId, {
    userAgent: request.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ ok: true });
}
