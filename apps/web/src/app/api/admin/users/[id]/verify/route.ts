import { NextResponse } from "next/server";
import { asOrganizationId, db, findUserById, listMembershipsForUser, markUserVerified, recordAuditLog } from "@cim/db";
import { authorizeAdmin } from "../../../auth";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Lets a platform admin confirm an account's email by hand — the bridge for
 * when outgoing email isn't configured yet. It only flips emailVerifiedAt on
 * an existing, live, unverified account; it never creates a session or
 * changes a password.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeAdmin();
  if (auth.response) return auth.response;

  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "User not found" }, { status: 404 });
  const target = await findUserById(db, id);
  if (!target || target.deletedAt) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (target.emailVerifiedAt) return NextResponse.json({ ok: true, alreadyVerified: true });

  await markUserVerified(db, target.id);

  // Leave a trail in the user's own organization audit log when they have one.
  const memberships = await listMembershipsForUser(db, target.id);
  const orgId = memberships[0]?.organization.id;
  if (orgId) {
    await recordAuditLog(db, asOrganizationId(orgId), {
      actorUserId: auth.user.id,
      action: "user.email_verified_by_admin",
      targetType: "user",
      targetId: target.id,
    });
  }
  console.info(`[admin] ${auth.user.id} manually verified the email of user ${target.id}`);
  return NextResponse.json({ ok: true });
}
