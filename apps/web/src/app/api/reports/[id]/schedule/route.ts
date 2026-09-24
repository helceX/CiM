import { NextResponse } from "next/server";
import { updateReportScheduleSchema } from "@cim/validation";
import { db, recordAuditLog, updateReportSchedule } from "@cim/db";
import { requirePermission } from "@/lib/tenant";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let context;
  try {
    context = await requirePermission("reports:write");
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json(
        { error: "You don't have permission to schedule this report" },
        { status: 403 },
      );
    }
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;
  const json = await request.json().catch(() => null);
  const parsed = updateReportScheduleSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const updated = await updateReportSchedule(
    db,
    context.organizationId,
    id,
    parsed.data.scheduleFrequency,
  );
  if (!updated) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  await recordAuditLog(db, context.organizationId, {
    actorUserId: context.userId,
    action: "report.schedule_updated",
    targetType: "report",
    targetId: id,
    metadata: { scheduleFrequency: parsed.data.scheduleFrequency },
  });

  return NextResponse.json({ ok: true });
}
