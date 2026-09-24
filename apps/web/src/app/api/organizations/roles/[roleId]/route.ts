import { NextResponse } from "next/server";
import { updateCustomRoleSchema } from "@cim/validation";
import { db, deleteCustomRole, getCustomRole, recordAuditLog, updateCustomRole } from "@cim/db";
import type { Permission } from "@cim/core";
import { permissionsBeyondCeiling, requirePermission } from "@/lib/tenant";

function forbiddenOrUnauthenticated(error: unknown) {
  if (error instanceof Error && error.message === "FORBIDDEN") {
    return NextResponse.json(
      { error: "Only an owner or admin can manage custom roles" },
      { status: 403 },
    );
  }
  return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ roleId: string }> },
) {
  let context;
  try {
    context = await requirePermission("org:manage_members");
  } catch (error) {
    return forbiddenOrUnauthenticated(error);
  }

  const { roleId } = await params;
  const json = await request.json().catch(() => null);
  const parsed = updateCustomRoleSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const existingRole = await getCustomRole(db, context.organizationId, roleId);
  if (!existingRole) {
    return NextResponse.json({ error: "Role not found" }, { status: 404 });
  }

  // Same ceiling as create (POST /api/organizations/roles), but checked
  // against every permission this edit *changes* — not just the ones
  // being added. Checking only additions still left a stripping path
  // open: someone holding only org:manage_members could edit a
  // colleague's more-privileged role and remove permissions neither of
  // them need to hold, silently cutting that colleague's access with no
  // consent from anyone who actually held those permissions.
  const existingPermissions = existingRole.permissions as Permission[];
  const changedPermissions = Array.from(
    new Set([...existingPermissions, ...parsed.data.permissions]),
  ).filter(
    (permission) =>
      existingPermissions.includes(permission) !== parsed.data.permissions.includes(permission),
  );
  const disallowedPermissions = permissionsBeyondCeiling(context.permissions, changedPermissions);
  if (disallowedPermissions.length > 0) {
    return NextResponse.json(
      { error: `You can't change permissions you don't have: ${disallowedPermissions.join(", ")}` },
      { status: 403 },
    );
  }

  const result = await updateCustomRole(db, context.organizationId, roleId, parsed.data);
  if (!result.ok) {
    if (result.reason === "not_found") {
      return NextResponse.json({ error: "Role not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "A role with that name already exists" }, { status: 409 });
  }

  await recordAuditLog(db, context.organizationId, {
    actorUserId: context.userId,
    action: "custom_role.updated",
    targetType: "custom_role",
    targetId: roleId,
    metadata: { name: result.role.name, permissions: result.role.permissions },
  });

  return NextResponse.json(result.role);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ roleId: string }> },
) {
  let context;
  try {
    context = await requirePermission("org:manage_members");
  } catch (error) {
    return forbiddenOrUnauthenticated(error);
  }

  const { roleId } = await params;
  const result = await deleteCustomRole(db, context.organizationId, roleId);
  if (result === "not_found") {
    return NextResponse.json({ error: "Role not found" }, { status: 404 });
  }
  if (result === "in_use") {
    return NextResponse.json(
      { error: "This role is still assigned to at least one member" },
      { status: 409 },
    );
  }

  await recordAuditLog(db, context.organizationId, {
    actorUserId: context.userId,
    action: "custom_role.deleted",
    targetType: "custom_role",
    targetId: roleId,
  });

  return NextResponse.json({ ok: true });
}
