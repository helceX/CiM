import { NextResponse } from "next/server";
import { createCustomRoleSchema } from "@cim/validation";
import { createCustomRole, db, listCustomRolesForOrganization, recordAuditLog } from "@cim/db";
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

export async function GET() {
  let context;
  try {
    context = await requirePermission("org:manage_members");
  } catch (error) {
    return forbiddenOrUnauthenticated(error);
  }

  const roles = await listCustomRolesForOrganization(db, context.organizationId);
  return NextResponse.json(roles);
}

export async function POST(request: Request) {
  let context;
  try {
    context = await requirePermission("org:manage_members");
  } catch (error) {
    return forbiddenOrUnauthenticated(error);
  }

  const json = await request.json().catch(() => null);
  const parsed = createCustomRoleSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  // A custom role is only dangerous once a membership is assigned to
  // it — but nothing should let a caller define one with permissions
  // beyond their own, or the assignment step (re-role/invite, which
  // enforce the same ceiling) is the only thing standing between
  // org:manage_members alone and a role that grants everything.
  const disallowedPermissions = permissionsBeyondCeiling(context.permissions, parsed.data.permissions);
  if (disallowedPermissions.length > 0) {
    return NextResponse.json(
      { error: `You can't grant permissions you don't have: ${disallowedPermissions.join(", ")}` },
      { status: 403 },
    );
  }

  const result = await createCustomRole(db, context.organizationId, parsed.data);
  if (!result.ok) {
    return NextResponse.json({ error: "A role with that name already exists" }, { status: 409 });
  }

  await recordAuditLog(db, context.organizationId, {
    actorUserId: context.userId,
    action: "custom_role.created",
    targetType: "custom_role",
    targetId: result.role.id,
    metadata: { name: result.role.name, permissions: result.role.permissions },
  });

  return NextResponse.json(result.role, { status: 201 });
}
