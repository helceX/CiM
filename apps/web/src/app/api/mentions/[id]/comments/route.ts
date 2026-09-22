import { NextResponse } from "next/server";
import { addCommentToMentionSchema } from "@cim/validation";
import { addCommentToMention, db, recordAuditLog } from "@cim/db";
import { requirePermission } from "@/lib/tenant";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let context;
  try {
    context = await requirePermission("mentions:write");
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json(
        { error: "You don't have permission to comment on mentions" },
        { status: 403 },
      );
    }
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;
  const json = await request.json().catch(() => null);
  const parsed = addCommentToMentionSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const result = await addCommentToMention(
    db,
    context.organizationId,
    id,
    context.userId,
    parsed.data.body,
  );
  if (!result.ok) {
    return NextResponse.json({ error: "Mention not found" }, { status: 404 });
  }

  await recordAuditLog(db, context.organizationId, {
    actorUserId: context.userId,
    action: "mention.commented",
    targetType: "mention",
    targetId: id,
    metadata: { commentId: result.comment.id },
  });

  return NextResponse.json(result.comment, { status: 201 });
}
