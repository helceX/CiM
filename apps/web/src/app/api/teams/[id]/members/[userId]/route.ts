import { NextResponse } from "next/server";
import { z } from "zod";
import { db, getTeam, removeTeamMember } from "@cim/db";
import { authorizeMember, canManageTeam } from "@/lib/team-auth";

/** Remove someone from a team — or leave it yourself. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; userId: string }> }) {
  const auth = await authorizeMember();
  if (auth.response) return auth.response;
  const { context } = auth;

  const { id, userId } = await params;
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(userId).success) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!(await getTeam(db, context.organizationId, id))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const leavingSelf = userId === context.userId;
  if (!leavingSelf && !(await canManageTeam(context, id))) {
    return NextResponse.json({ error: "Only the team's lead or an admin can remove people." }, { status: 403 });
  }

  const removed = await removeTeamMember(db, context.organizationId, id, userId);
  if (!removed) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
