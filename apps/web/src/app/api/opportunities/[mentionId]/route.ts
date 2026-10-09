import { NextResponse } from "next/server";
import { z } from "zod";
import { db, recordAuditLog, saveOpportunityFollowup } from "@cim/db";
import { requirePermission } from "@/lib/tenant";

const schema = z.object({
  status: z.enum([
    "new",
    "reviewing",
    "possibly_eligible",
    "not_eligible",
    "planning",
    "preparing",
    "submitted",
    "won",
    "pending_outcome",
    "not_awarded",
    "archived",
  ]),
  assignedToUserId: z.string().uuid().nullable(),
  note: z.string().trim().max(4000),
  dueAt: z.string().datetime().nullable(),
  sourceVerified: z.boolean(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ mentionId: string }> },
) {
  let context;
  try {
    context = await requirePermission("mentions:write");
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error && error.message === "FORBIDDEN"
            ? "Forbidden"
            : "Not authenticated",
      },
      { status: error instanceof Error && error.message === "FORBIDDEN" ? 403 : 401 },
    );
  }

  const { mentionId } = await params;
  if (!z.string().uuid().safeParse(mentionId).success)
    return NextResponse.json({ error: "Invalid mention id" }, { status: 400 });
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid follow-up", issues: parsed.error.issues },
      { status: 400 },
    );

  const result = await saveOpportunityFollowup(db, context.organizationId, mentionId, {
    ...parsed.data,
    dueAt: parsed.data.dueAt ? new Date(parsed.data.dueAt) : null,
    updatedByUserId: context.userId,
  });
  if (!result)
    return NextResponse.json(
      {
        error:
          "Opportunity signal not found, or assignee is not an active organization member",
      },
      { status: 404 },
    );

  await recordAuditLog(db, context.organizationId, {
    actorUserId: context.userId,
    action: "opportunity.followup_updated",
    targetType: "mention",
    targetId: mentionId,
    metadata: {
      status: result.status,
      assignedToUserId: result.assignedToUserId,
      dueAt: result.dueAt?.toISOString() ?? null,
      sourceVerified: Boolean(result.sourceVerifiedAt),
    },
  });
  return NextResponse.json({ followup: result });
}
