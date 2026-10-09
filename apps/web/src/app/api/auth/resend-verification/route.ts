import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { resendVerificationSchema } from "@cim/validation";
import { generateRawToken, hashToken } from "@cim/core";
import { db, findUserByEmail, createEmailVerificationToken } from "@cim/db";
import { getEnv } from "@cim/config";
import { checkRateLimit, clientIpFrom } from "@/lib/rate-limit";
import { sendEmail, verificationEmailBody } from "@/lib/email";
import { rejectIfNotHuman } from "@/lib/turnstile";

const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

export async function POST(request: Request) {
  const e = await getTranslations("errors");
  const ip = clientIpFrom(request);
  const ipLimit = await checkRateLimit(`resend-verify:${ip}`, { limit: 10, windowSeconds: 60 * 60 });
  if (!ipLimit.allowed) {
    return NextResponse.json({ error: e("rateLimited") }, { status: 429 });
  }

  const json = await request.json().catch(() => null);
  const notHuman = await rejectIfNotHuman(json, ip);
  if (notHuman) return notHuman;
  const parsed = resendVerificationSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: e("invalidInput") }, { status: 400 });
  }

  // Per-address cap too, so this endpoint can't be used to flood one inbox.
  const emailLimit = await checkRateLimit(`resend-verify-email:${parsed.data.email}`, {
    limit: 3,
    windowSeconds: 60 * 60,
  });
  if (!emailLimit.allowed) {
    return NextResponse.json({ error: e("rateLimited") }, { status: 429 });
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
