import { NextResponse } from "next/server";
import { resendVerificationSchema } from "@cim/validation";
import { generateRawToken, hashToken } from "@cim/core";
import { db, findUserByEmail, createEmailVerificationToken } from "@cim/db";
import { getEnv } from "@cim/config";
import { checkRateLimit, clientIpFrom } from "@/lib/rate-limit";
import { sendEmail, verificationEmailBody } from "@/lib/email";

const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

export async function POST(request: Request) {
  const ip = clientIpFrom(request);
  const ipLimit = await checkRateLimit(`resend-verify:${ip}`, { limit: 10, windowSeconds: 60 * 60 });
  if (!ipLimit.allowed) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  const parsed = resendVerificationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  // Per-address cap too, so this endpoint can't be used to flood one inbox.
  const emailLimit = await checkRateLimit(`resend-verify-email:${parsed.data.email}`, {
    limit: 3,
    windowSeconds: 60 * 60,
  });
  if (!emailLimit.allowed) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  // Same response whether or not the account exists or is already verified
  // (SECURITY.md — no account enumeration).
  const user = await findUserByEmail(db, parsed.data.email);
  if (user && !user.emailVerifiedAt) {
    const rawToken = generateRawToken();
    await createEmailVerificationToken(db, {
      userId: user.id,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS),
    });
    await sendEmail({
      toEmail: user.email,
      subject: "Verify your Mediaory account",
      bodyText: verificationEmailBody(`${getEnv().APP_URL}/verify-email?token=${rawToken}`),
      kind: "verify_email",
    });
  }

  return NextResponse.json({ ok: true });
}
