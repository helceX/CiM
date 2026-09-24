import { NextResponse } from "next/server";
import { createReportRun, db, getReport, recordAuditLog } from "@cim/db";
import { periodTypeToSinceDays } from "@cim/reports/templates";
import { requirePermission } from "@/lib/tenant";
import { enqueueReportGeneration } from "@/lib/reports";
import { checkRateLimit } from "@/lib/rate-limit";

/** "Run again" — a new execution of an existing saved Report (docs/product/USER_FLOWS.md §5). */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  let context;
  try {
    // Same permission POST /api/reports requires — "run again" is still
    // triggering a real render, not a read, and must not be reachable by
    // a read-only reports:read role (report_recipient/viewer).
    context = await requirePermission("reports:write");
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json(
        { error: "You don't have permission to run this report" },
        { status: 403 },
      );
    }
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Same resource-exhaustion rationale as POST /api/reports — shares the
  // per-organization budget so "run again" can't be used to bypass it.
  const rateLimit = await checkRateLimit(`report-generate:${context.organizationId}`, {
    limit: 10,
    windowSeconds: 10 * 60,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Too many reports requested. Try again later." }, { status: 429 });
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
