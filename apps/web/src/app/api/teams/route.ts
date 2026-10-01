import { NextResponse } from "next/server";
import { z } from "zod";
import { createTeam, db, recordAuditLog } from "@cim/db";
import { checkRateLimit } from "@/lib/rate-limit";
import { authorizeMember, canCreateTeams } from "@/lib/team-auth";

const bodySchema = z.object({
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(240).optional(),
});

/** Create a team inside your organization; you become its lead. */
export async function POST(request: Request) {
  const auth = await authorizeMember();
  if (auth.response) return auth.response;
  const { context } = auth;
  if (!canCreateTeams(context)) {
    return NextResponse.json({ error: "Your role can't create teams." }, { status: 403 });
  }

  const limited = await checkRateLimit(`team-create:${context.userId}`, { limit: 20, windowSeconds: 3600 });
  if (!limited.allowed) return NextResponse.json({ error: "Too many requests." }, { status: 429 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Give the team a name (2–60 characters)." }, { status: 400 });
  }

  const result = await createTeam(db, context.organizationId, context.userId, parsed.data);
  if (!result.ok) return NextResponse.json({ error: "A team with that name already exists." }, { status: 409 });

  await recordAuditLog(db, context.organizationId, {
    actorUserId: context.userId,
    action: "team.created",
    targetType: "team",
    targetId: result.team.id,
    metadata: { name: result.team.name },
  });
  return NextResponse.json({ teamId: result.team.id });
}
