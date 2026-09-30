import { NextResponse } from "next/server";
import { db, recordAuditLog, revokeApiKey } from "@cim/db";
import { requirePermission } from "@/lib/tenant";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let context;
  try {
    context = await requirePermission("api_keys:manage");
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json(
        { error: "Only an owner or admin can manage API keys" },
        { status: 403 },
      );
    }
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;
  const revoked = await revokeApiKey(db, context.organizationId, id);
  if (!revoked) {
    return NextResponse.json({ error: "API key not found" }, { status: 404 });
  }

  await recordAuditLog(db, context.organizationId, {
    actorUserId: context.userId,
    action: "api_key.revoked",
    targetType: "api_key",
    targetId: id,
  });

  return NextResponse.json({ ok: true });
}
