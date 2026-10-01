import { NextResponse } from "next/server";
import { z } from "zod";
import { db, deleteTeam, getTeam, recordAuditLog } from "@cim/db";
import { authorizeMember, canManageTeam } from "@/lib/team-auth";

/** Delete a team (its lead, or someone who manages members). People stay in the organization. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeMember();
  if (auth.response) return auth.response;
  const { context } = auth;

  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const team = await getTeam(db, context.organizationId, id);
  if (!team) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await canManageTeam(context, id))) {
    return NextResponse.json({ error: "Only the team's lead or an admin can delete it." }, { status: 403 });
  }

  await deleteTeam(db, context.organizationId, id);
  await recordAuditLog(db, context.organizationId, {
    actorUserId: context.userId,
    action: "team.deleted",
    targetType: "team",
    targetId: id,
    metadata: { name: team.name },
  });
  return NextResponse.json({ ok: true });
}
