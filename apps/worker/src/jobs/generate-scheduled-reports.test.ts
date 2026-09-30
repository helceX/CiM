import { describe, expect, it, vi } from "vitest";
import type { Queue } from "bullmq";
import type { GenerateReportJobData } from "@cim/core";

/**
 * A pure unit test (mocking @cim/db entirely, no real Postgres) — same
 * rationale as enforce-retention.test.ts. Proves one due report's
 * failure doesn't stop every report ordered after it from being queued.
 */
const getReportsDueForScheduledRun = vi.fn();
const createReportRun = vi.fn();
const markReportScheduledRun = vi.fn();

vi.mock("@cim/db", () => ({
  // createReportRun + markReportScheduledRun now run inside db.transaction
  // (generate-scheduled-reports.ts) — this fake just invokes the callback
  // with a stand-in tx, since both calls are already fully mocked above
  // and don't care about the tx object's identity at this unit-test level.
  db: {
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({}),
  },
  getReportsDueForScheduledRun: (...args: unknown[]) => getReportsDueForScheduledRun(...args),
  createReportRun: (...args: unknown[]) => createReportRun(...args),
  markReportScheduledRun: (...args: unknown[]) => markReportScheduledRun(...args),
}));

const { processGenerateScheduledReportsJob } = await import("./generate-scheduled-reports");

function dueReport(id: string) {
  return {
    id,
    organizationId: `org-for-${id}`,
    periodType: "weekly" as const,
    createdByUserId: "user-1",
  };
}

describe("processGenerateScheduledReportsJob — per-report failure isolation", () => {
  it("still generates report 2 when report 1's run creation throws", async () => {
    getReportsDueForScheduledRun.mockResolvedValueOnce([dueReport("report-1"), dueReport("report-2")]);
    createReportRun.mockRejectedValueOnce(new Error("transient DB error"));
    createReportRun.mockResolvedValueOnce({ id: "run-2" });
    markReportScheduledRun.mockResolvedValueOnce(undefined);

    const generateReportQueue = {
      add: vi.fn().mockResolvedValueOnce(undefined),
    } as unknown as Queue<GenerateReportJobData>;

    await processGenerateScheduledReportsJob(generateReportQueue);

    expect(createReportRun).toHaveBeenCalledTimes(2);
    expect(generateReportQueue.add).toHaveBeenCalledTimes(1);
    expect(markReportScheduledRun).toHaveBeenCalledTimes(1);
    expect(markReportScheduledRun).toHaveBeenCalledWith(expect.anything(), "report-2");
  });

  /**
   * Regression: createReportRun and markReportScheduledRun used to be two
   * separate statements with the queue add in between — a failure in
   * markReportScheduledRun after the run had already been created left
   * lastScheduledRunAt un-advanced, so the same report read as still
   * "due" and got a *second* ReportRun + generation job on the next
   * daily tick. Now both run inside one db.transaction, so a failure in
   * markReportScheduledRun must also roll back — and skip — the
   * generateReportQueue.add() call for that report, never leaving an
   * enqueued job whose run creation "succeeded" but whose mark didn't.
   */
  it("never enqueues a generation job for a report whose scheduled-run mark failed", async () => {
    getReportsDueForScheduledRun.mockResolvedValueOnce([dueReport("report-3")]);
    createReportRun.mockResolvedValueOnce({ id: "run-3" });
    markReportScheduledRun.mockRejectedValueOnce(new Error("transient DB error"));

    const generateReportQueue = {
      add: vi.fn().mockResolvedValueOnce(undefined),
    } as unknown as Queue<GenerateReportJobData>;

    await processGenerateScheduledReportsJob(generateReportQueue);

    expect(markReportScheduledRun).toHaveBeenCalledWith(expect.anything(), "report-3");
    expect(generateReportQueue.add).not.toHaveBeenCalled();
  });
});
