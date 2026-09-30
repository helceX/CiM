import { NextResponse } from "next/server";
import { inviteMemberSchema } from "@cim/validation";
import { generateRawToken, hashToken } from "@cim/core";
import { db, findUserByEmail, inviteMember, recordAuditLog } from "@cim/db";
import { getEnv } from "@cim/config";
import { permissionsBeyondCeiling, requirePermission, resolvePermissionsForRoleString } from "@/lib/tenant";
import { getCurrentUser } from "@/lib/session";
import { invitationEmailBody, sendEmail } from "@/lib/email";
import { checkRateLimit } from "@/lib/rate-limit";

const INVITATION_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * docs/ux/SCREEN_INVENTORY.md Screen 18 "Organization Users" — the first
 * real caller of `org:manage_members` (owner/admin only). Rejects
 * inviting an email that already has an account rather than silently
 * mis-behaving: MVP is one organization per user (apps/web/src/lib/
 * tenant.ts's own note on `getOrgContext` — it resolves a single
 * membership, not a switcher), so a second membership for an existing
 * user would be data the rest of the app can't actually act on yet.
 */
export async function POST(request: Request) {
  let context;
  try {
    context = await requirePermission("org:manage_members");
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json(
        { error: "Only an owner or admin can invite members" },
        { status: 403 },
      );
    }
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Invites send a real email to an address the sender doesn't control —
  // the same abuse shape rate-limited endpoints elsewhere guard against.
  const rateLimit = await checkRateLimit(`member-invite:${context.organizationId}`, {
    limit: 20,
    windowSeconds: 60 * 60,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many invitations sent. Try again later." },
      { status: 429 },
    );
  }

  const json = await request.json().catch(() => null);
  const parsed = inviteMemberSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const input = parsed.data;

  const existing = await findUserByEmail(db, input.email);
  if (existing) {
    return NextResponse.json(
      {
        error:
          "This person already has an account and can't be invited to a second organization yet.",
      },
      { status: 409 },
    );
  }

  // docs/product/FEATURE_MATRIX.md P2 "RBAC custom roles" — a
  // shape-valid role that isn't one of the six fixed ones must actually
  // be one of this organization's own custom roles; the zod schema
  // alone can't check that (it just accepts any uuid). And whatever
  // role it resolves to, its permissions can't exceed the inviter's own
  // — otherwise org:manage_members alone (grantable via a custom role
  // with no other permission) would let anyone invite a new
  // organization_owner.
  const rolePermissions = await resolvePermissionsForRoleString(context.organizationId, input.role);
  if (!rolePermissions) {
    return NextResponse.json({ error: "That role doesn't exist" }, { status: 400 });
  }
  const disallowedPermissions = permissionsBeyondCeiling(context.permissions, rolePermissions);
  if (disallowedPermissions.length > 0) {
    return NextResponse.json(
      {
        error: `You can't invite someone to a role with permissions you don't have: ${disallowedPermissions.join(", ")}`,
      },
      { status: 403 },
    );
  }

  const rawToken = generateRawToken();
  const { membershipId } = await inviteMember(db, context.organizationId, {
    email: input.email,
    role: input.role,
    invitedByUserId: context.userId,
    tokenHash: hashToken(rawToken),
    tokenExpiresAt: new Date(Date.now() + INVITATION_TOKEN_TTL_MS),
  });

  await recordAuditLog(db, context.organizationId, {
    actorUserId: context.userId,
    action: "member.invited",
    targetType: "organization_membership",
    targetId: membershipId,
    metadata: { email: input.email, role: input.role },
  });

  const inviteLink = `${getEnv().APP_URL}/invitations/accept?token=${rawToken}`;
  await sendEmail({
    toEmail: input.email,
    subject: `You're invited to join ${context.organizationName} on CiM`,
    bodyText: invitationEmailBody(
      context.organizationName,
      `${currentUser.firstName} ${currentUser.lastName}`,
      inviteLink,
    ),
    kind: "invitation",
  });

  return NextResponse.json({ ok: true, membershipId });
}
