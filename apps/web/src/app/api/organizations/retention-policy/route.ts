import { NextResponse } from "next/server";
import { updateRetentionPolicySchema } from "@cim/validation";
import { db, recordAuditLog, upsertRetentionPolicy } from "@cim/db";
import { requirePermission } from "@/lib/tenant";

export async function PATCH(request: Request) {
  let context;
  try {
    context = await requirePermission("org:manage_settings");
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json(
        { error: "Only an owner or admin can change the retention policy" },
        { status: 403 },
      );
    }
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = updateRetentionPolicySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  await upsertRetentionPolicy(db, context.organizationId, parsed.data);

  await recordAuditLog(db, context.organizationId, {
    actorUserId: context.userId,
    action: "retention_policy.updated",
    targetType: "organization",
    targetId: context.organizationId,
    metadata: { mentionRetentionDays: parsed.data.mentionRetentionDays },
  });

  return NextResponse.json({ ok: true });
}
