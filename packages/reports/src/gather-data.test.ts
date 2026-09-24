import { describe, expect, it, vi } from "vitest";
import type { Db } from "@cim/db";
import { gatherReportData } from "./gather-data";

vi.mock("@cim/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cim/db")>();
  return {
    ...actual,
    getDashboardSummary: vi.fn().mockResolvedValue({}),
    getMentionVolumeSeries: vi.fn().mockResolvedValue([]),
    getSentimentTrendSeries: vi.fn().mockResolvedValue([]),
    getSourceDistribution: vi.fn().mockResolvedValue([]),
    listRecentMentions: vi.fn().mockResolvedValue([]),
    getTopicBreakdown: vi.fn().mockResolvedValue([]),
    getCompetitorComparison: vi.fn().mockResolvedValue([]),
    getLatestInsightForOrganization: vi.fn().mockResolvedValue(undefined),
    listLatestRecommendationsForOrganization: vi.fn().mockResolvedValue([]),
  };
});

describe("gatherReportData", () => {
  it("rejects an unrecognized template key before touching the database", async () => {
    // No real Db needed — the check must happen before any query runs.
    const fakeDb = {} as Db;
    await expect(
      gatherReportData(fakeDb, "org" as never, {
        projectId: "p1",
        projectName: "Project",
        templateKey: "does_not_exist" as never,
        periodType: "rolling_7d",
        periodStart: new Date(),
        periodEnd: new Date(),
      }),
    ).rejects.toThrow(/Unknown report template/);
  });

  it("returns the caller's own periodStart/periodEnd, never a fresh `new Date()` computed at render time", async () => {
    // Regression: this used to recompute periodStart/periodEnd from
    // `new Date()` inside gatherReportData itself, so a ReportRun's stored
    // period (set once at enqueue time, apps/web/src/app/api/reports/
    // route.ts) could silently drift from what the render actually used —
    // worse the longer the job sat queued (backlog, retries, a restart).
    const fakeDb = {} as Db;
    const periodStart = new Date("2020-01-01T00:00:00.000Z");
    const periodEnd = new Date("2020-01-08T00:00:00.000Z");

    const data = await gatherReportData(fakeDb, "org" as never, {
      projectId: "p1",
      projectName: "Project",
      templateKey: "weekly_summary",
      periodType: "rolling_7d",
      periodStart,
      periodEnd,
    });

    expect(data.periodStart).toBe(periodStart);
    expect(data.periodEnd).toBe(periodEnd);
  });
});
