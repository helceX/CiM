import { NextResponse } from "next/server";
import { createCustomRoleSchema } from "@cim/validation";
import { createCustomRole, db, listCustomRolesForOrganization, recordAuditLog } from "@cim/db";
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
