import { and, desc, eq, isNull } from "drizzle-orm";
import type { Db } from "../client";
import { projects } from "../schema/organizations";
import { reportFiles, reportRuns, reports } from "../schema/reports";
import type { OrganizationId } from "./tenant-scope";

export type ReportListItem = {
  report: typeof reports.$inferSelect;
  projectName: string;
  latestRun: typeof reportRuns.$inferSelect | null;
};

export async function createReport(
  db: Db,
  organizationId: OrganizationId,
  input: {
    projectId: string;
    createdByUserId: string;
    name: string;
    templateKey: string;
    periodType: string;
  },
) {
  const [row] = await db
    .insert(reports)
    .values({
      organizationId,
      projectId: input.projectId,
      createdByUserId: input.createdByUserId,
      name: input.name,
      templateKey: input.templateKey,
      periodType: input.periodType,
    })
    .returning();
  if (!row) throw new Error("failed to create report");
  return row;
}

export async function getReport(db: Db, organizationId: OrganizationId, reportId: string) {
  const [row] = await db
    .select()
    .from(reports)
    .where(
      and(
        eq(reports.organizationId, organizationId),
        eq(reports.id, reportId),
        isNull(reports.deletedAt),
      ),
    )
    .limit(1);
  return row;
}

/** List view — each report's most recent run, so the UI can show live status without an N+1 per row on click. */
export async function listReports(
  db: Db,
  organizationId: OrganizationId,
): Promise<ReportListItem[]> {
  const rows = await db
    .select({ report: reports, projectName: projects.name })
    .from(reports)
    .innerJoin(projects, eq(projects.id, reports.projectId))
    .where(and(eq(reports.organizationId, organizationId), isNull(reports.deletedAt)))
    .orderBy(desc(reports.createdAt));

  const withLatestRun = await Promise.all(
    rows.map(async ({ report, projectName }) => {
      const [latestRun] = await db
        .select()
        .from(reportRuns)
        .where(eq(reportRuns.reportId, report.id))
        .orderBy(desc(reportRuns.createdAt))
        .limit(1);
      return { report, projectName, latestRun: latestRun ?? null };
    }),
  );
  return withLatestRun;
}

export async function createReportRun(
  db: Db,
  organizationId: OrganizationId,
  input: { reportId: string; requestedByUserId: string; periodStart: Date; periodEnd: Date },
) {
  const [row] = await db
    .insert(reportRuns)
    .values({
      organizationId,
      reportId: input.reportId,
      requestedByUserId: input.requestedByUserId,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
    })
    .returning();
  if (!row) throw new Error("failed to create report run");
  return row;
}

export async function listReportRuns(db: Db, reportId: string) {
  return db.select().from(reportRuns).where(eq(reportRuns.reportId, reportId)).orderBy(desc(reportRuns.createdAt));
}

export type ReportRunForWorker = {
  run: typeof reportRuns.$inferSelect;
  report: typeof reports.$inferSelect;
  projectName: string;
};

/**
 * Worker-internal lookup by id alone (no organizationId) — same trust
 * model as `crawl-source.ts` fetching a Source by job.data.sourceId: the
 * API route already validated org/project ownership before creating the
 * ReportRun and enqueuing this job, so the worker trusts the id rather
 * than re-deriving tenant scope from a session that doesn't exist here.
 */
export async function getReportRunForWorker(
  db: Db,
  reportRunId: string,
): Promise<ReportRunForWorker | undefined> {
  const [row] = await db
    .select({ run: reportRuns, report: reports, projectName: projects.name })
    .from(reportRuns)
    .innerJoin(reports, eq(reports.id, reportRuns.reportId))
    .innerJoin(projects, eq(projects.id, reports.projectId))
    .where(eq(reportRuns.id, reportRunId))
    .limit(1);
  return row;
}

export async function getReportRun(db: Db, organizationId: OrganizationId, reportRunId: string) {
  const [row] = await db
    .select()
    .from(reportRuns)
    .where(and(eq(reportRuns.organizationId, organizationId), eq(reportRuns.id, reportRunId)))
    .limit(1);
  return row;
}

/** docs/architecture/INGESTION.md job system — status transitions mirror CrawlJob/AIJob's queued->running->completed|failed. */
export async function markReportRunRunning(db: Db, reportRunId: string): Promise<void> {
  await db
    .update(reportRuns)
    .set({ status: "running", startedAt: new Date() })
    .where(eq(reportRuns.id, reportRunId));
}

export async function markReportRunCompleted(db: Db, reportRunId: string): Promise<void> {
  await db
    .update(reportRuns)
    .set({ status: "completed", completedAt: new Date() })
    .where(eq(reportRuns.id, reportRunId));
}

/** brief/USER_FLOWS.md §5 — failure surfaces with its error, never a silently missing report. */
export async function markReportRunFailed(db: Db, reportRunId: string, error: string): Promise<void> {
  await db
    .update(reportRuns)
    .set({ status: "failed", completedAt: new Date(), error })
    .where(eq(reportRuns.id, reportRunId));
}

export async function createReportFile(
  db: Db,
  input: { reportRunId: string; format: "pdf" | "csv"; mimeType: string; data: Buffer },
): Promise<void> {
  await db.insert(reportFiles).values({
    reportRunId: input.reportRunId,
    format: input.format,
    mimeType: input.mimeType,
    sizeBytes: input.data.byteLength,
    data: input.data,
  });
}

export async function getReportFile(db: Db, reportRunId: string, format: "pdf" | "csv") {
  const [row] = await db
    .select()
    .from(reportFiles)
    .where(and(eq(reportFiles.reportRunId, reportRunId), eq(reportFiles.format, format)))
    .limit(1);
  return row;
}
