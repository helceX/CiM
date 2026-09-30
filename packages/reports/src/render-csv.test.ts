import { describe, expect, it } from "vitest";
import { renderReportCsv } from "./render-csv";
import { fakeReportData } from "./test-fixtures";

describe("renderReportCsv", () => {
  it("writes a header row and one row per top story", () => {
    const csv = renderReportCsv(fakeReportData());
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe('"Title","Source","Sentiment","Priority","Published","URL"');
    expect(lines).toHaveLength(3);
  });

  it("escapes embedded quotes per RFC 4180, never breaking the row", () => {
    const csv = renderReportCsv(fakeReportData());
    expect(csv).toContain('"A ""quoted"", tricky headline"');
  });

  it("falls back to Unclassified for a null sentiment rather than an empty cell", () => {
    const csv = renderReportCsv(
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
    expect(csv).toContain('"Unclassified"');
  });

  it("emits only the header when there are no top stories, never a fabricated row", () => {
    const csv = renderReportCsv(fakeReportData({ topStories: [] }));
    expect(csv.split("\r\n")).toHaveLength(1);
  });

  it("neutralizes a formula-injection payload in an ingested article title (CWE-1236)", () => {
    const base = fakeReportData().topStories[0]!;
    const csv = renderReportCsv(
      fakeReportData({
        topStories: [
          { ...base, article: { ...base.article, title: "=cmd|' /C calc'!A0" } },
        ],
      }),
    );
    const dataRow = csv.split("\r\n")[1]!;
    expect(dataRow.startsWith('"=')).toBe(false);
    expect(dataRow.startsWith("\"'=cmd")).toBe(true);
  });
});
