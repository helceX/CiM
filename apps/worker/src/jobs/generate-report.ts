import type { Job } from "bullmq";
import { getEnv } from "@cim/config";
import type { GenerateReportJobData } from "@cim/core";
import {
  asOrganizationId,
  createNotificationForUser,
  createReportFile,
  db,
  getReportRunForWorker,
  markReportRunCompleted,
  markReportRunFailed,
  markReportRunRunning,
} from "@cim/db";
import {
  gatherReportData,
  renderHtmlToPdf,
  renderReportCsv,
  renderReportHtml,
  renderReportXlsx,
  type ReportSection,
} from "@cim/reports";

/**
 * On-demand (not scheduled) — enqueued once per "Generate report" click,
 * never inline in the request (brief §34/§91/§128). A failure marks the
 * run `failed` with its error, then notifies the requester — never a
 * silently missing report (docs/product/USER_FLOWS.md §5).
 */
export async function processGenerateReportJob(
  job: Job<GenerateReportJobData>,
): Promise<void> {
  const found = await getReportRunForWorker(db, job.data.reportRunId);
  if (!found) {
    throw new Error(`Report run not found: ${job.data.reportRunId}`);
  }
  const { run, report, projectName } = found;
  const organizationId = asOrganizationId(run.organizationId);

  await markReportRunRunning(db, run.id);

  try {
    const data = await gatherReportData(db, organizationId, {
      projectId: report.projectId,
      projectName,
      templateKey: report.templateKey as "weekly_summary" | "monitoring_overview" | "custom",
      periodType: report.periodType,
      periodStart: run.periodStart,
      periodEnd: run.periodEnd,
      sections: report.sections as ReportSection[] | null,
    });

    const html = renderReportHtml(data);
    const csv = renderReportCsv(data);
    const xlsx = await renderReportXlsx(data);

    // The PDF needs a headless browser; if the machine cannot start one the run still completes with
    // the HTML page (print-ready), CSV and spreadsheet, and says why the PDF is missing.
    let pdf: Buffer | null = null;
    let pdfNote: string | undefined;
    try {
      pdf = await renderHtmlToPdf(html, { executablePath: getEnv().PLAYWRIGHT_CHROMIUM_PATH });
    } catch (pdfError) {
      const reason = pdfError instanceof Error ? pdfError.message.split("\n")[0] : String(pdfError);
      pdfNote = `The PDF could not be produced (${reason}); the HTML, CSV and Excel files are available.`;
      console.error(`[worker] report PDF failed (run ${run.id}):`, pdfError);
    }

    if (pdf) await createReportFile(db, { reportRunId: run.id, format: "pdf", mimeType: "application/pdf", data: pdf });
    await createReportFile(db, { reportRunId: run.id, format: "html", mimeType: "text/html; charset=utf-8", data: Buffer.from(html, "utf-8") });
    await createReportFile(db, { reportRunId: run.id, format: "csv", mimeType: "text/csv", data: Buffer.from(csv, "utf-8") });
    await createReportFile(db, {
      reportRunId: run.id,
      format: "xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      data: xlsx,
    });

    await markReportRunCompleted(db, run.id, pdfNote);
    console.log(`[worker] generated report "${report.name}" (run ${run.id})`);

    if (run.requestedByUserId) {
      await createNotificationForUser(db, organizationId, run.requestedByUserId, {
        kind: "report",
        title: report.name,
        body: `Your report "${report.name}" is ready to download.${pdfNote ? " (PDF unavailable — HTML, CSV and Excel are ready.)" : ""}`,
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await markReportRunFailed(db, run.id, message);
    console.error(`[worker] report generation failed (run ${run.id}):`, error);

    if (run.requestedByUserId) {
      await createNotificationForUser(db, organizationId, run.requestedByUserId, {
        kind: "report",
        title: report.name,
        body: `Report generation failed: ${message}`,
      });
    }
  }
}
