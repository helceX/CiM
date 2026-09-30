import { describe, expect, it, vi } from "vitest";
import type { Db } from "@cim/db";
import { getSavedVisual, runVisual } from "@cim/db";
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
    getSavedVisual: vi.fn(),
    runVisual: vi.fn(),
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

  describe("visual sections", () => {
    const okId = "22222222-2222-4222-8222-222222222222";
    const goneId = "33333333-3333-4333-8333-333333333333";
    const brokenId = "44444444-4444-4444-8444-444444444444";
    const input = {
      projectId: "p1",
      projectName: "Project",
      templateKey: "custom" as const,
      periodType: "rolling_7d",
      periodStart: new Date(),
      periodEnd: new Date(),
      sections: ["trend", `visual:${okId}`, `visual:${goneId}`, `visual:${brokenId}`] as never,
    };

    it("resolves each visual for the report's organization; a missing or failing one is 'unavailable', not fatal", async () => {
      const spec = { measure: "mentions", dimension: "source", periodDays: 30, filters: {}, chartType: "bar", sort: "value_desc", limit: 50 };
      vi.mocked(getSavedVisual).mockImplementation((async (_db: unknown, _org: unknown, id: string) => {
        if (id === goneId) return undefined;
        return { id, name: id === okId ? "By source" : "Broken", spec };
      }) as never);
      vi.mocked(runVisual).mockImplementation((async (_db: unknown, _org: unknown, _spec: unknown) => {
        if (vi.mocked(runVisual).mock.calls.length === 2) throw new Error("boom");
        return { rows: [{ label: "Wire", value: 3 }], truncated: false };
      }) as never);

      const data = await gatherReportData({} as Db, "org-1" as never, input);

      expect(vi.mocked(getSavedVisual).mock.calls.every((call) => call[1] === "org-1")).toBe(true);
      expect(data.visuals[`visual:${okId}`]).toMatchObject({ name: "By source", measure: "mentions", dimension: "source", rows: [{ label: "Wire", value: 3 }] });
      expect(data.visuals[`visual:${goneId}`]).toMatchObject({ name: "Visual no longer available", rows: null });
      expect(data.visuals[`visual:${brokenId}`]).toMatchObject({ name: "Broken", rows: null });
      expect(Object.keys(data.visuals)).not.toContain("trend");
    });
  });
});
