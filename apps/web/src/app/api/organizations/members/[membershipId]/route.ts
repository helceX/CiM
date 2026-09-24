import { NextResponse } from "next/server";
import { updateMemberRoleSchema } from "@cim/validation";
import {
  db,
  recordAuditLog,
  revokeAllSessionsForUser,
  revokeMembership,
  updateMemberRole,
} from "@cim/db";
import { requirePermission, resolvePermissionsForRoleString } from "@/lib/tenant";

function forbiddenOrUnauthenticated(error: unknown) {
  if (error instanceof Error && error.message === "FORBIDDEN") {
    return NextResponse.json(
      { error: "Only an owner or admin can manage members" },
      { status: 403 },
    );
  }
  return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
}

function errorResponse(error: "not_found" | "sole_owner") {
  if (error === "not_found")
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  return NextResponse.json(
    { error: "This is the organization's only owner — add another owner first." },
    { status: 409 },
  );
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ membershipId: string }> },
) {
  let context;
  try {
    context = await requirePermission("org:manage_members");
  } catch (error) {
    return forbiddenOrUnauthenticated(error);
  }

  const { membershipId } = await params;
  const json = await request.json().catch(() => null);
  const parsed = updateMemberRoleSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  // docs/product/FEATURE_MATRIX.md P2 "RBAC custom roles" — see
  // invite/route.ts's identical checks. A caller can only assign a role
  // whose permissions are a subset of their own — otherwise anyone
  // holding org:manage_members (a custom role can grant that alone,
  // without any other permission) could re-role themselves, or anyone
  // else, straight to organization_owner.
  const rolePermissions = await resolvePermissionsForRoleString(
    context.organizationId,
    parsed.data.role,
  );
  if (!rolePermissions) {
    return NextResponse.json({ error: "That role doesn't exist" }, { status: 400 });
  }
  if (!rolePermissions.every((permission) => context.permissions.includes(permission))) {
    return NextResponse.json(
      { error: "You can't grant a role with permissions you don't have" },
      { status: 403 },
    );
  }

  const result = await updateMemberRole(
    db,
    context.organizationId,
    membershipId,
    parsed.data.role,
  );
  if (!result.ok) return errorResponse(result.error);

  await recordAuditLog(db, context.organizationId, {
    actorUserId: context.userId,
    action: "member.role_changed",
    targetType: "organization_membership",
    targetId: membershipId,
    metadata: { role: parsed.data.role },
  });

  return NextResponse.json({ ok: true });
}

/**
 * Revoking access must actually end it, not just relabel it — a live
 * session for the revoked user is killed in the same request (ADR-005:
 * sessions are server-checked and revocable, so this is where that
 * property earns its keep).
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ membershipId: string }> },
) {
  let context;
  try {
    context = await requirePermission("org:manage_members");
  } catch (error) {
    return forbiddenOrUnauthenticated(error);
  }

  const { membershipId } = await params;
  const result = await revokeMembership(db, context.organizationId, membershipId);
  if (!result.ok) return errorResponse(result.error);

  await revokeAllSessionsForUser(db, result.userId);

  await recordAuditLog(db, context.organizationId, {
    actorUserId: context.userId,
    action: "member.revoked",
    targetType: "organization_membership",
    targetId: membershipId,
  });

  return NextResponse.json({ ok: true });
}
