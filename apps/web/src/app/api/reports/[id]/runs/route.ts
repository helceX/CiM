import { NextResponse } from "next/server";
import { createReportRun, db, getReport, recordAuditLog } from "@cim/db";
import { periodTypeToSinceDays } from "@cim/reports/templates";
import { requireOrgContext } from "@/lib/tenant";
import { enqueueReportGeneration } from "@/lib/reports";

/** "Run again" — a new execution of an existing saved Report (docs/product/USER_FLOWS.md §5). */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  let context;
  try {
    context = await requireOrgContext();
  } catch {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;
  const report = await getReport(db, context.organizationId, id);
  if (!report) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  const sinceDays = periodTypeToSinceDays(report.periodType);
  const periodEnd = new Date();
  const periodStart = new Date(periodEnd.getTime() - sinceDays * 24 * 60 * 60 * 1000);
  const run = await createReportRun(db, context.organizationId, {
    reportId: report.id,
    requestedByUserId: context.userId,
    periodStart,
    periodEnd,
  });
  await enqueueReportGeneration(run.id);

  await recordAuditLog(db, context.organizationId, {
    actorUserId: context.userId,
    action: "report.run_requested",
    targetType: "report",
    targetId: report.id,
  });

  return NextResponse.json({ ok: true, reportRunId: run.id });
}
