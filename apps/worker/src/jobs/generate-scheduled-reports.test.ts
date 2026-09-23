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
  db: {},
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
});
