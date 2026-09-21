import { NextResponse } from "next/server";
import { asOrganizationId, db, exportAccountData, listMembershipsForUser, recordAuditLog } from "@cim/db";
import { getCurrentUser } from "@/lib/session";

/**
 * docs/architecture/SECURITY.md "Supported from MVP: data export ...
 * audit trail of these actions." Identity + membership data only — never
 * tenant media content (mentions/articles), which belongs to the
 * organization, not to this one member (see exportAccountData's own note).
 */
export async function GET() {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const data = await exportAccountData(db, currentUser.id);
  if (!data) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const memberships = await listMembershipsForUser(db, currentUser.id);
  for (const { organization } of memberships) {
    await recordAuditLog(db, asOrganizationId(organization.id), {
      actorUserId: currentUser.id,
      action: "account.exported",
      targetType: "user",
      targetId: currentUser.id,
    });
  }

  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="cim-account-export-${currentUser.id}.json"`,
    },
  });
}
