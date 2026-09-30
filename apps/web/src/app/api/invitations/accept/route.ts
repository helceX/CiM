import { NextResponse } from "next/server";
import { acceptInvitationSchema } from "@cim/validation";
import { hashPassword, hashToken } from "@cim/core";
import { acceptInvitation, db, recordAuditLog } from "@cim/db";
import { checkRateLimit, clientIpFrom } from "@/lib/rate-limit";
import { createUserSession } from "@/lib/session";

/**
 * Public — unauthenticated by definition (this IS how the invited person
 * gets their first session). Accepting is the proof of email ownership,
 * the same trust boundary as clicking a verification link (ADR-005).
 */
export async function POST(request: Request) {
  const ip = clientIpFrom(request);
  const rateLimit = await checkRateLimit(`invitation-accept:${ip}`, {
    limit: 20,
    windowSeconds: 60 * 60,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Try again later." },
      { status: 429 },
    );
  }

  const json = await request.json().catch(() => null);
  const parsed = acceptInvitationSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const input = parsed.data;

  const passwordHash = await hashPassword(input.password);
  const accepted = await acceptInvitation(db, hashToken(input.token), {
    firstName: input.firstName,
    lastName: input.lastName,
    passwordHash,
  });
  if (!accepted) {
    return NextResponse.json(
      { error: "This invitation is invalid or has expired." },
      { status: 400 },
    );
  }

  await recordAuditLog(db, accepted.organizationId, {
    actorUserId: accepted.userId,
    action: "member.invitation_accepted",
    targetType: "user",
    targetId: accepted.userId,
  });

  await createUserSession(accepted.userId, {
    userAgent: request.headers.get("user-agent") ?? undefined,
    ipAddress: ip,
  });

  return NextResponse.json({ ok: true });
}
