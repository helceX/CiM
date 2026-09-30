import { NextResponse } from "next/server";
import { db, recordAuditLog, removeTagFromMention } from "@cim/db";
import { requirePermission } from "@/lib/tenant";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; tagId: string }> },
) {
  let context;
  try {
    context = await requirePermission("mentions:write");
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json(
        { error: "You don't have permission to tag mentions" },
        { status: 403 },
      );
    }
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id, tagId } = await params;
  const removed = await removeTagFromMention(db, context.organizationId, id, tagId);
  if (!removed) {
    return NextResponse.json({ error: "Mention or tag not found" }, { status: 404 });
  }

  await recordAuditLog(db, context.organizationId, {
    actorUserId: context.userId,
    action: "mention.untagged",
    targetType: "mention",
    targetId: id,
    metadata: { tagId },
  });

  return NextResponse.json({ ok: true });
}
