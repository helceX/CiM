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
    const buffer = await renderReportXlsx(fakeReportData());
    const workbook = await loadWorkbook(buffer);

    const sheetNames = workbook.worksheets.map((sheet) => sheet.name);
    expect(sheetNames).toEqual([
      "Summary",
      "Mention Volume",
      "Sentiment Trend",
      "Source Distribution",
      "Top Stories",
    ]);

    const summarySheet = workbook.getWorksheet("Summary")!;
    expect(summarySheet.getRow(1).getCell(1).value).toBe("Metric");
    expect(summarySheet.getRow(1).getCell(2).value).toBe("Value");
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
});
