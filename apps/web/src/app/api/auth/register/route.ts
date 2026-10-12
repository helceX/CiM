import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { and, eq, sql } from "drizzle-orm";
import { getLocale, getTranslations } from "next-intl/server";
import { registerSchema } from "@cim/validation";
import { hashPassword, generateRawToken, hashToken } from "@cim/core";
import {
  db,
  findUserByEmail,
  registerOrganizationOwner,
  createEmailVerificationToken,
  recordAuditLog,
  asOrganizationId,
  markUserVerified, schema, type Db,
} from "@cim/db";
import { getEnv } from "@cim/config";
import { checkRateLimit, clientIpFrom } from "@/lib/rate-limit";
import { sendEmail, verificationEmailBody } from "@/lib/email";
import { rejectIfNotHuman } from "@/lib/turnstile";
import { openLoginValue, PENDING_COOKIE, type LoginIdentity } from "@/lib/federated-login";
import { createUserSession } from "@/lib/session";
import { blogAttribution } from "@/lib/blog-attribution";

const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

export async function POST(request: Request) {
  const e = await getTranslations("errors");
  const ip = clientIpFrom(request);
  const rateLimit = await checkRateLimit(`register:${ip}`, { limit: 10, windowSeconds: 60 * 60 });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: e("rateLimited") }, { status: 429 });
  }

  const json = await request.json().catch(() => null);
  const store = json?.federated === true ? await cookies() : null;
  const identity = store ? openLoginValue<LoginIdentity & { expires: number }>(store.get(PENDING_COOKIE)?.value, getEnv().SESSION_SECRET) : null;
  if (json?.federated === true && !identity) return NextResponse.json({ error: e("invalidInput") }, { status: 400 });
  const notHuman = await rejectIfNotHuman(json, ip);
  if (notHuman) return notHuman;
  const parsed = registerSchema.safeParse(identity ? { ...json, email: identity.email || json.email, password: `Aa1${randomBytes(48).toString("base64url")}` } : json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: e("invalidInput"), issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const input = parsed.data;
  const acquisition = typeof json?.attribution === "string" ? blogAttribution(json.attribution, getEnv().SESSION_SECRET) : undefined;

  const existing = await findUserByEmail(db, input.email);
  if (existing) {
    // Generic response — no account-enumeration signal (SECURITY.md).
    return NextResponse.json({ ok: true });
  }

  const passwordHash = await hashPassword(input.password);
  const registrationInput = {
    email: input.email,
    passwordHash,
    firstName: input.firstName,
    lastName: input.lastName,
    companyName: input.companyName,
    jobTitle: input.jobTitle,
    locale: await getLocale(),
  };
  const { user, organization } = identity ? await db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`login:${identity.provider}:${identity.subject}`}))`);
    const [already] = await tx.select({ id: schema.loginIdentities.id }).from(schema.loginIdentities).where(and(eq(schema.loginIdentities.provider, identity.provider), eq(schema.loginIdentities.subject, identity.subject)));
    if (already) throw new Error("Registration already completed");
    const result = await registerOrganizationOwner(tx as unknown as Db, registrationInput);
    await tx.insert(schema.loginIdentities).values({ userId: result.user.id, provider: identity.provider, subject: identity.subject });
    if (identity.emailVerified) await markUserVerified(tx as unknown as Db, result.user.id);
    return result;
  }) : await registerOrganizationOwner(db, registrationInput);

  if (identity) store?.delete(PENDING_COOKIE);
  if (identity?.emailVerified) {
    await recordAuditLog(db, asOrganizationId(organization.id), { actorUserId: user.id, action: "user.registered", targetType: "organization", targetId: organization.id, metadata: acquisition });
    await createUserSession(user.id, { userAgent: request.headers.get("user-agent") ?? undefined, ipAddress: ip });
    return NextResponse.json({ ok: true, signedIn: true });
  }
  const rawToken = generateRawToken();
  await createEmailVerificationToken(db, {
    userId: user.id,
    tokenHash: hashToken(rawToken),
    expiresAt: new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS),
  });

  await recordAuditLog(db, asOrganizationId(organization.id), {
    actorUserId: user.id,
    action: "user.registered",
    metadata: acquisition,
    targetType: "organization",
    targetId: organization.id,
  });

  const verifyLink = `${getEnv().APP_URL}/verify-email?token=${rawToken}`;
  await sendEmail({
    toEmail: user.email,
    subject: "Verify your Mediaory account",
    bodyText: verificationEmailBody(verifyLink),
    kind: "verify_email",
  });

  return NextResponse.json({ ok: true });
}
