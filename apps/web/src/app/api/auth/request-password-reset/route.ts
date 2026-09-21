import { NextResponse } from "next/server";
import { requestPasswordResetSchema } from "@cim/validation";
import { generateRawToken, hashToken } from "@cim/core";
import { db, findUserByEmail, createPasswordResetToken } from "@cim/db";
import { getEnv } from "@cim/config";
import { checkRateLimit, clientIpFrom } from "@/lib/rate-limit";
import { sendEmail, passwordResetEmailBody } from "@/lib/email";

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

export async function POST(request: Request) {
  const ip = clientIpFrom(request);
  const rateLimit = await checkRateLimit(`reset:${ip}`, { limit: 10, windowSeconds: 60 * 60 });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  const json = await request.json().catch(() => null);
  const parsed = requestPasswordResetSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const user = await findUserByEmail(db, parsed.data.email);
  // Always respond the same way whether or not the account exists
  // (SECURITY.md — no account enumeration via this endpoint).
  if (user) {
    const rawToken = generateRawToken();
    await createPasswordResetToken(db, {
      userId: user.id,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
    });
    const link = `${getEnv().APP_URL}/reset-password?token=${rawToken}`;
    await sendEmail({
      toEmail: user.email,
      subject: "Reset your CiM password",
      bodyText: passwordResetEmailBody(link),
      kind: "password_reset",
    });
  }

  return NextResponse.json({ ok: true });
}
