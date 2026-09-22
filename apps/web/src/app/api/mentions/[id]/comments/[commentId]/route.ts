import { NextResponse } from "next/server";
import { db, deleteMentionComment, recordAuditLog } from "@cim/db";
import { requirePermission } from "@/lib/tenant";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; commentId: string }> },
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

  const { id, commentId } = await params;
  const removed = await deleteMentionComment(db, context.organizationId, commentId, context.userId);
  if (!removed) {
    return NextResponse.json(
      { error: "Comment not found, or you can only delete your own comments" },
      { status: 404 },
    );
  }

  await recordAuditLog(db, context.organizationId, {
    actorUserId: context.userId,
    action: "mention.comment_deleted",
    targetType: "mention",
    targetId: id,
    metadata: { commentId },
  });

  return NextResponse.json({ ok: true });
}
