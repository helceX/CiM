import { NextResponse } from "next/server";
import { z } from "zod";
import { addTeamMember, db, getTeam } from "@cim/db";
import { authorizeMember, canManageTeam } from "@/lib/team-auth";

const bodySchema = z.object({ userId: z.uuid(), role: z.enum(["lead", "member"]).default("member") });

/** Add an existing organization member to a team (its lead, or someone who manages members). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeMember();
  if (auth.response) return auth.response;
  const { context } = auth;

  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await getTeam(db, context.organizationId, id))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await canManageTeam(context, id))) {
    return NextResponse.json({ error: "Only the team's lead or an admin can add people." }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const result = await addTeamMember(db, context.organizationId, id, parsed.data.userId, parsed.data.role);
  if (!result.ok) {
    return result.reason === "not_found"
      ? NextResponse.json({ error: "Not found" }, { status: 404 })
      : NextResponse.json({ error: "That person isn't an active member of this organization — invite them first." }, { status: 422 });
  }
  return NextResponse.json({ ok: true });
}
