import { NextResponse } from "next/server";
import { createReportSchema } from "@cim/validation";
import { createReport, createReportRun, db, getProject, recordAuditLog } from "@cim/db";
import { periodTypeToRange } from "@cim/reports/templates";
import { requirePermission } from "@/lib/tenant";
import { enqueueReportGeneration } from "@/lib/reports";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  let context;
  try {
    // Same permission every other report-mutation route in this feature
    // requires (schedule/route.ts, runs/[runId]/share/route.ts) — a
    // report_recipient role is explicitly read-only (reports:read only,
    // packages/core/src/authz.ts) and must not be able to trigger a real
    // headless-Chromium render.
    context = await requirePermission("reports:write");
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json(
        { error: "You don't have permission to create reports" },
        { status: 403 },
      );
    }
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // A report run spins up a real headless-Chromium render in the worker
  // (packages/reports) — genuine resource-exhaustion surface, so it's
  // rate-limited per organization on top of the auth requirement.
  const rateLimit = await checkRateLimit(`report-generate:${context.organizationId}`, {
    limit: 10,
    windowSeconds: 10 * 60,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Too many reports requested. Try again later." }, { status: 429 });
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
    sections: input.templateKey === "custom" ? input.sections : undefined,
    periodType: input.periodType,
  });

  const { periodStart, periodEnd } = periodTypeToRange(input.periodType);
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
