import { NextResponse } from "next/server";
import { deleteOrganizationSchema } from "@cim/validation";
import { db, softDeleteOrganizationWithAuditLog } from "@cim/db";
import { requireOrgContext } from "@/lib/tenant";

/**
 * docs/architecture/SECURITY.md "Supported from MVP: ... organization
 * deletion ... audit trail of these actions." Owner-only, and the client
 * must type the organization's exact name back — the same friction as
 * every other "type to confirm" destructive-delete pattern, since this
 * removes every member's access to every project/mention/report at once.
 */
export async function POST(request: Request) {
  let context;
  try {
    context = await requireOrgContext();
  } catch {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (context.role !== "organization_owner") {
    return NextResponse.json(
      { error: "Only an organization owner can delete the organization" },
      { status: 403 },
    );
  }

  const json = await request.json().catch(() => null);
  const parsed = deleteOrganizationSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  if (parsed.data.confirmName !== context.organizationName) {
    return NextResponse.json(
      { error: "Organization name doesn't match" },
      { status: 400 },
    );
  }

  // Soft-delete + its audit entry commit together or not at all — see
  // softDeleteOrganizationWithAuditLog's own docstring.
  await softDeleteOrganizationWithAuditLog(db, context.organizationId, context.userId);

  return NextResponse.json({ ok: true });
}
