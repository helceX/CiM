import { NextResponse } from "next/server";
import { z } from "zod";
import { db, deleteSocialConnection, recordAuditLog } from "@cim/db";
import { requirePermission } from "@/lib/tenant";

/** Disconnect an account: its tokens and the events collected from it are deleted. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  let context;
  try {
    context = await requirePermission("org:manage_settings");
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Only an owner or admin can disconnect an account." }, { status: 403 });
    }
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const removed = await deleteSocialConnection(db, context.organizationId, id);
  if (!removed) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await recordAuditLog(db, context.organizationId, {
    actorUserId: context.userId,
    action: "social.disconnected",
    targetType: "social_connection",
    targetId: id,
    metadata: {},
  });
  return NextResponse.json({ ok: true });
}
