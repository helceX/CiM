import { NextResponse } from "next/server";
import { updateCustomRoleSchema } from "@cim/validation";
import { db, deleteCustomRole, recordAuditLog, updateCustomRole } from "@cim/db";
import { requirePermission } from "@/lib/tenant";

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
