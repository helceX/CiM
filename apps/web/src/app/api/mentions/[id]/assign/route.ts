import { NextResponse } from "next/server";
import { assignMentionSchema } from "@cim/validation";
import { assignMention, db, recordAuditLog } from "@cim/db";
import { requirePermission } from "@/lib/tenant";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let context;
  try {
    context = await requirePermission("mentions:write");
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json(
        { error: "You don't have permission to assign mentions" },
        { status: 403 },
      );
    }
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;
  const json = await request.json().catch(() => null);
  const parsed = assignMentionSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const result = await assignMention(
    db,
    context.organizationId,
    id,
    parsed.data.assignedToUserId,
  );
  if (result === "not_found") {
    return NextResponse.json({ error: "Mention not found" }, { status: 404 });
  }
  if (result === "invalid_assignee") {
    return NextResponse.json(
      { error: "That user isn't an active member of this organization" },
      { status: 400 },
    );
  }

  await recordAuditLog(db, context.organizationId, {
    actorUserId: context.userId,
    action: "mention.assigned",
    targetType: "mention",
    targetId: id,
    metadata: { assignedToUserId: parsed.data.assignedToUserId },
  });

  return NextResponse.json({ ok: true });
}
