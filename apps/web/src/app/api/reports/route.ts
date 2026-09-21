import { NextResponse } from "next/server";
import { createReportSchema } from "@cim/validation";
import { createReport, createReportRun, db, getProject, recordAuditLog } from "@cim/db";
import { periodTypeToSinceDays } from "@cim/reports/templates";
import { requireOrgContext } from "@/lib/tenant";
import { enqueueReportGeneration } from "@/lib/reports";

export async function POST(request: Request) {
  let context;
  try {
    context = await requireOrgContext();
  } catch {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = createReportSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });
  }
  const input = parsed.data;

  // Never trust a client-supplied project id without verifying it belongs
  // to this organization first (ADR-001).
  const project = await getProject(db, context.organizationId, input.projectId);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const report = await createReport(db, context.organizationId, {
    projectId: project.id,
    createdByUserId: context.userId,
    name: input.name,
    templateKey: input.templateKey,
    periodType: input.periodType,
  });

  const sinceDays = periodTypeToSinceDays(input.periodType);
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
    action: "report.created",
    targetType: "report",
    targetId: report.id,
  });

  return NextResponse.json({ ok: true, reportId: report.id, reportRunId: run.id });
}
