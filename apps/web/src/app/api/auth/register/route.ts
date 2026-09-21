import { NextResponse } from "next/server";
import { registerSchema } from "@cim/validation";
import { hashPassword, generateRawToken, hashToken } from "@cim/core";
import {
  db,
  findUserByEmail,
  registerOrganizationOwner,
  createEmailVerificationToken,
  recordAuditLog,
  asOrganizationId,
} from "@cim/db";
import { getEnv } from "@cim/config";
import { checkRateLimit, clientIpFrom } from "@/lib/rate-limit";
import { sendEmail, verificationEmailBody } from "@/lib/email";

const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

export async function POST(request: Request) {
  const ip = clientIpFrom(request);
  const rateLimit = await checkRateLimit(`register:${ip}`, { limit: 10, windowSeconds: 60 * 60 });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  const json = await request.json().catch(() => null);
  const parsed = registerSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const input = parsed.data;

  const existing = await findUserByEmail(db, input.email);
  if (existing) {
    // Generic response — no account-enumeration signal (SECURITY.md).
    return NextResponse.json({ ok: true });
  }

  const passwordHash = await hashPassword(input.password);
  const { user, organization } = await registerOrganizationOwner(db, {
    email: input.email,
    passwordHash,
    firstName: input.firstName,
    lastName: input.lastName,
    companyName: input.companyName,
  });

  const rawToken = generateRawToken();
  await createEmailVerificationToken(db, {
    userId: user.id,
    tokenHash: hashToken(rawToken),
    expiresAt: new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS),
  });

  await recordAuditLog(db, asOrganizationId(organization.id), {
    actorUserId: user.id,
    action: "user.registered",
    targetType: "organization",
    targetId: organization.id,
  });

  const verifyLink = `${getEnv().APP_URL}/verify-email?token=${rawToken}`;
  await sendEmail({
    toEmail: user.email,
    subject: "Verify your CiM account",
    bodyText: verificationEmailBody(verifyLink),
    kind: "verify_email",
  });

  return NextResponse.json({ ok: true });
}
