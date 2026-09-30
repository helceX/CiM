import type { Queue } from "bullmq";
import { QUEUE_NAMES, type GenerateReportJobData } from "@cim/core";
import {
  createReportRun,
  db,
  getReportsDueForScheduledRun,
  markReportScheduledRun,
  type Db,
} from "@cim/db";
import { periodTypeToRange } from "@cim/reports/templates";

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
    // Isolated per report (the established fan-out pattern, generate-insight.ts)
    // — this job runs once daily with attempts:1, so one report's failure
    // must not silently skip every report ordered after it until tomorrow.
    try {
      const { periodStart, periodEnd } = periodTypeToRange(report.periodType);

      // Regression: createReportRun and markReportScheduledRun used to be
      // two separate statements with the queue add in between — a
      // transient failure in either the add() or markReportScheduledRun
      // (already-created run, mark never lands) left lastScheduledRunAt
      // un-advanced, so this same report reads as still "due" and gets a
      // *second* ReportRun + generation job on the very next daily tick,
      // spamming a "weekly"/"monthly"/"yearly" report on back-to-back
      // days. One transaction means the run and the mark commit together
      // or neither does — a failure here leaves no orphaned run and the
      // report legitimately still "due" for the next tick to pick up.
      const run = await db.transaction(async (tx) => {
        const txDb = tx as unknown as Db;
        const created = await createReportRun(txDb, report.organizationId, {
          reportId: report.id,
          requestedByUserId: report.createdByUserId,
          periodStart,
          periodEnd,
        });
        await markReportScheduledRun(txDb, report.id);
        return created;
      });

      await generateReportQueue.add(
        QUEUE_NAMES.generateReport,
        { reportRunId: run.id },
        { attempts: 2, backoff: { type: "exponential", delay: 5000 } },
      );
    } catch (error) {
      console.error(`[worker] generate_scheduled_reports failed for report ${report.id}:`, error);
    }
  }
}
