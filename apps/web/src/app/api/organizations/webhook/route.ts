import { NextResponse } from "next/server";
import { updateOrganizationWebhookSchema } from "@cim/validation";
import { db, recordAuditLog, updateOrganizationWebhookUrl } from "@cim/db";
import { requirePermission } from "@/lib/tenant";

export async function PATCH(request: Request) {
  let context;
  try {
    context = await requirePermission("org:manage_settings");
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json(
        { error: "Only an owner or admin can change the webhook URL" },
        { status: 403 },
      );
    }
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = updateOrganizationWebhookSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const webhookUrl = parsed.data.webhookUrl === "" ? null : parsed.data.webhookUrl;
  await updateOrganizationWebhookUrl(db, context.organizationId, webhookUrl);

  await recordAuditLog(db, context.organizationId, {
    actorUserId: context.userId,
    action: "organization.webhook_updated",
    targetType: "organization",
    targetId: context.organizationId,
    metadata: { configured: webhookUrl !== null },
  });

  return NextResponse.json({ ok: true });
}
