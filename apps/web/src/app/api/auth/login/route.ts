import { NextResponse } from "next/server";
import { loginSchema } from "@cim/validation";
import { verifyPassword } from "@cim/core";
import { db, findUserByEmail } from "@cim/db";
import { checkRateLimit, clientIpFrom } from "@/lib/rate-limit";
import { createUserSession } from "@/lib/session";

const GENERIC_ERROR = "Incorrect email or password.";

export async function POST(request: Request) {
  const ip = clientIpFrom(request);
  const rateLimit = await checkRateLimit(`login:${ip}`, { limit: 20, windowSeconds: 15 * 60 });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  const json = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 400 });
  }

  const user = await findUserByEmail(db, parsed.data.email);
  if (!user) {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
  }

  const passwordOk = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!passwordOk) {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
  }

  if (!user.emailVerifiedAt) {
    return NextResponse.json(
      { error: "Please verify your email before signing in.", code: "UNVERIFIED" },
      { status: 403 },
    );
  }

  await createUserSession(user.id, {
    userAgent: request.headers.get("user-agent") ?? undefined,
    ipAddress: ip,
  });

  return NextResponse.json({ ok: true });
}
