import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { renderReportXlsx } from "./render-xlsx";
import { fakeReportData } from "./test-fixtures";

async function loadWorkbook(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  // exceljs's bundled types predate @types/node 22's generic `Buffer<T>` —
  // a real Buffer at runtime, just a structural mismatch against its
  // narrower declaration.
  await workbook.xlsx.load(
    buffer as unknown as Parameters<typeof workbook.xlsx.load>[0],
  );
  return workbook;
}

describe("renderReportXlsx", () => {
  it("writes one sheet per section, each with a header row", async () => {
    // fakeReportData()'s default templateKey is "weekly_summary", which
    // (like render-html.ts) does not include Source Distribution — only
    // "monitoring_overview" and a "custom" report that picked "sources" do.
    const buffer = await renderReportXlsx(fakeReportData());
    const workbook = await loadWorkbook(buffer);

    const sheetNames = workbook.worksheets.map((sheet) => sheet.name);
    expect(sheetNames).toEqual([
      "Summary",
      "Mention Volume",
      "Sentiment Trend",
      "Top Stories",
    ]);

    const summarySheet = workbook.getWorksheet("Summary")!;
    expect(summarySheet.getRow(1).getCell(1).value).toBe("Metric");
    expect(summarySheet.getRow(1).getCell(2).value).toBe("Value");
  });

  it("includes Source Distribution for the monitoring_overview template", async () => {
    const buffer = await renderReportXlsx(
      fakeReportData({ templateKey: "monitoring_overview" }),
    );
    const workbook = await loadWorkbook(buffer);

    const sheetNames = workbook.worksheets.map((sheet) => sheet.name);
    expect(sheetNames).toEqual([
      "Summary",
      "Mention Volume",
      "Sentiment Trend",
      "Source Distribution",
      "Top Stories",
    ]);
  });

  it("writes exactly the sections chosen for a custom-template report, in order, never a fixed default set", async () => {
    // Regression: renderReportXlsx used to ignore templateKey/sections
    // entirely and always emit the same fixed sheet set, silently
    // diverging from what the report-builder section picker configured
    // (and from renderReportHtml, which already respects it).
    const buffer = await renderReportXlsx(
      fakeReportData({
        templateKey: "custom",
        sections: ["competitors", "ai_insight", "recommendations"],
        insight: {
          id: "insight-1",
          kind: "whats_changed",
          summary: "Coverage picked up after the launch.",
          confidence: "0.8",
          method: "mock-heuristic-v1",
          why: null,
          priority: null,
          periodStart: new Date("2026-01-01T00:00:00Z"),
          periodEnd: new Date("2026-01-08T00:00:00Z"),
          createdAt: new Date("2026-01-08T00:00:00Z"),
          projectName: "Brand Monitoring",
          evidence: [],
        },
        recommendations: [
          {
            id: "rec-1",
            kind: "recommendation",
            summary: "Prepare a statement.",
            confidence: "0.7",
            method: "mock-heuristic-v1",
            why: "Negative coverage clustered this week.",
            priority: "high",
            periodStart: new Date("2026-01-01T00:00:00Z"),
            periodEnd: new Date("2026-01-08T00:00:00Z"),
            createdAt: new Date("2026-01-08T00:00:00Z"),
            evidence: [],
          },
        ],
      }),
    );
    const workbook = await loadWorkbook(buffer);

    const sheetNames = workbook.worksheets.map((sheet) => sheet.name);
    expect(sheetNames).toEqual([
      "Summary",
      "Competitor Comparison",
      "AI Insight",
      "Recommendations",
    ]);

    const competitorsSheet = workbook.getWorksheet("Competitor Comparison")!;
    expect(competitorsSheet.getRow(2).getCell(1).value).toBe("Brand mentions");

    const insightSheet = workbook.getWorksheet("AI Insight")!;
    const insightRows = insightSheet.getSheetValues().slice(2) as unknown as [
      unknown,
      string,
      unknown,
    ][];
    const summaryRow = insightRows.find((row) => row[1] === "Summary");
    expect(summaryRow?.[2]).toBe("Coverage picked up after the launch.");

    const recommendationsSheet = workbook.getWorksheet("Recommendations")!;
    expect(recommendationsSheet.getRow(2).getCell(1).value).toBe(
      "Prepare a statement.",
    );
    expect(recommendationsSheet.getRow(2).getCell(3).value).toBe("high");
  });

  it("emits an empty-state row on the AI Insight sheet when none was generated, never a fabricated one", async () => {
    const buffer = await renderReportXlsx(
      fakeReportData({
        templateKey: "custom",
        sections: ["ai_insight"],
        insight: undefined,
      }),
    );
    const workbook = await loadWorkbook(buffer);

    const insightSheet = workbook.getWorksheet("AI Insight")!;
    expect(insightSheet.getRow(2).getCell(2).value).toBe(
      "Not available — no AI insight generated for this project yet.",
    );
  });

  it("writes real summary values, not placeholders", async () => {
    const data = fakeReportData();
    const buffer = await renderReportXlsx(data);
    const workbook = await loadWorkbook(buffer);

    const summarySheet = workbook.getWorksheet("Summary")!;
    const rows = summarySheet.getSheetValues().slice(2) as unknown as [
      unknown,
      string,
      unknown,
    ][];
    const totalMentionsRow = rows.find((row) => row[1] === "Total mentions");
    expect(totalMentionsRow?.[2]).toBe(data.summary.totalMentions);
  });

  it("falls back to Unclassified for a null sentiment in the Top Stories sheet", async () => {
    const buffer = await renderReportXlsx(
      fakeReportData({
        topStories: [
          {
            mention: { ...fakeReportData().topStories[0]!.mention, sentiment: null },
            article: fakeReportData().topStories[0]!.article,
            source: fakeReportData().topStories[0]!.source,
            assigneeName: null,
          },
        ],
      }),
    );
    const workbook = await loadWorkbook(buffer);

    const topStoriesSheet = workbook.getWorksheet("Top Stories")!;
    expect(topStoriesSheet.getRow(2).getCell(3).value).toBe("Unclassified");
  });

  it("emits only the header row when there are no top stories, never a fabricated row", async () => {
    const buffer = await renderReportXlsx(fakeReportData({ topStories: [] }));
    const workbook = await loadWorkbook(buffer);

    const topStoriesSheet = workbook.getWorksheet("Top Stories")!;
    expect(topStoriesSheet.rowCount).toBe(1);
  });

  it("neutralizes a formula-injection payload in an ingested article title (CWE-1236)", async () => {
    const base = fakeReportData().topStories[0]!;
    const buffer = await renderReportXlsx(
      fakeReportData({
        topStories: [
          { ...base, article: { ...base.article, title: "=cmd|' /C calc'!A0" } },
        ],
      }),
    );
    const workbook = await loadWorkbook(buffer);

    const topStoriesSheet = workbook.getWorksheet("Top Stories")!;
    const titleCell = String(topStoriesSheet.getRow(2).getCell(1).value);
    expect(titleCell.startsWith("=")).toBe(false);
    expect(titleCell).toBe("'=cmd|' /C calc'!A0");
  });

  it("neutralizes a formula-injection payload in the project name on the Summary sheet (CWE-1236)", async () => {
    // The one user-controlled string on this sheet that the original
    // CWE-1236 fix (packages/reports/src/sanitize-cell.ts) missed —
    // every other user-controlled cell in this file already goes
    // through sanitizeCellValue.
    const buffer = await renderReportXlsx(
      fakeReportData({ projectName: "=cmd|' /C calc'!A0" }),
    );
    const workbook = await loadWorkbook(buffer);

    const summarySheet = workbook.getWorksheet("Summary")!;
    const projectCell = String(summarySheet.getRow(2).getCell(2).value);
    expect(projectCell.startsWith("=")).toBe(false);
    expect(projectCell).toBe("'=cmd|' /C calc'!A0");
  });
});
