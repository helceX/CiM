import type { Queue } from "bullmq";
import { QUEUE_NAMES, type GenerateReportJobData } from "@cim/core";
import {
  createReportRun,
  db,
  getReportsDueForScheduledRun,
  markReportScheduledRun,
} from "@cim/db";
import { periodTypeToSinceDays } from "@cim/reports/templates";

/**
 * docs/product/FEATURE_MATRIX.md P2 "Weekly/monthly/yearly scheduled
 * reports" — the scheduler-tick counterpart to processGenerateDigestJob,
 * one daily pass across every still-existing organization's due reports
 * (ADR-001's documented cross-tenant exception). Each due report gets a
 * real ReportRun through the exact same queued-generation path an
 * on-demand "Run again" click uses (processGenerateReportJob), never a
 * shortcut inline render — the async/never-inline rule (brief §34/§91/
 * §128) doesn't get relaxed just because a cron triggered it instead of
 * a request. `requestedByUserId` is the report's creator, not "no one",
 * so the existing notify-on-complete/failed path in
 * processGenerateReportJob fires unchanged.
 */
export async function processGenerateScheduledReportsJob(
  generateReportQueue: Queue<GenerateReportJobData>,
): Promise<void> {
  const dueReports = await getReportsDueForScheduledRun(db);

  for (const report of dueReports) {
    const sinceDays = periodTypeToSinceDays(report.periodType);
    const periodEnd = new Date();
    const periodStart = new Date(periodEnd.getTime() - sinceDays * 24 * 60 * 60 * 1000);

    const run = await createReportRun(db, report.organizationId, {
      reportId: report.id,
      requestedByUserId: report.createdByUserId,
      periodStart,
      periodEnd,
    });

    await generateReportQueue.add(
      QUEUE_NAMES.generateReport,
      { reportRunId: run.id },
      { attempts: 2, backoff: { type: "exponential", delay: 5000 } },
    );

    await markReportScheduledRun(db, report.id);
  }
}
