import { describe, expect, it } from "vitest";
import { fillTimeBuckets, renderVisualCsv, suggestChartTypes } from "./visuals";

const today = new Date("2026-09-30T15:00:00Z");

describe("fillTimeBuckets", () => {
  it("fills quiet days with 0 for counts, oldest first, through today", () => {
    const rows = fillTimeBuckets(
      [{ label: "2026-09-29", value: 4 }],
      { dimension: "day", measure: "mentions", periodDays: 3 },
      today,
    );
    expect(rows).toEqual([
      { label: "2026-09-27", value: 0 },
      { label: "2026-09-28", value: 0 },
      { label: "2026-09-29", value: 4 },
      { label: "2026-09-30", value: 0 },
    ]);
  });

  it("fills with null, not 0, for share measures", () => {
    const rows = fillTimeBuckets([], { dimension: "day", measure: "negative_share", periodDays: 1 }, today);
    expect(rows.every((row) => row.value === null)).toBe(true);
  });

  it("buckets weeks on Mondays", () => {
    const rows = fillTimeBuckets(
      [{ label: "2026-09-28", value: 7 }],
      { dimension: "week", measure: "mentions", periodDays: 14 },
      today,
    );
    expect(rows.map((row) => row.label)).toEqual(["2026-09-14", "2026-09-21", "2026-09-28"]);
    expect(rows.at(-1)?.value).toBe(7);
  });

  it("leaves non-time dimensions untouched", () => {
    const rows = [{ label: "News", value: 2 }];
    expect(fillTimeBuckets(rows, { dimension: "source_type", measure: "mentions", periodDays: 30 }, today)).toBe(rows);
  });
});

describe("suggestChartTypes", () => {
  it("suggests lines for time, bars for categories, always ends with a table", () => {
    expect(suggestChartTypes({ dimension: "day", measure: "mentions" }, 30)[0]).toBe("line");
    expect(suggestChartTypes({ dimension: "source", measure: "mentions" }, 10)).toEqual(["bar", "table"]);
    expect(suggestChartTypes({ dimension: "sentiment", measure: "mentions" }, 3)).toEqual(["bar", "pie", "table"]);
  });

  it("never offers a pie for non-additive measures", () => {
    expect(suggestChartTypes({ dimension: "sentiment", measure: "negative_share" }, 3)).not.toContain("pie");
    expect(suggestChartTypes({ dimension: "sentiment", measure: "unique_sources" }, 3)).not.toContain("pie");
  });
});

describe("renderVisualCsv", () => {
  it("writes a header and one row per label with CRLF line endings", () => {
    const csv = renderVisualCsv(
      [
        { label: "News", value: 4 },
        { label: "Blog", value: 0 },
      ],
      { measure: "mentions", dimension: "source_type" },
    );
    expect(csv).toBe('"Source type","Mentions"\r\n"News",4\r\n"Blog",0\r\n');
  });

  it("leaves an undefined share empty rather than 0", () => {
    const csv = renderVisualCsv([{ label: "2026-09-30", value: null }], { measure: "negative_share", dimension: "day" });
    expect(csv).toContain('"2026-09-30",\r\n');
  });

  it("neutralises spreadsheet formulas and escapes quotes in labels", () => {
    const csv = renderVisualCsv(
      [
        { label: '=HYPERLINK("http://evil.example","x")', value: 1 },
        { label: "+1-555", value: 2 },
        { label: 'He said "hi"', value: 3 },
      ],
      { measure: "mentions", dimension: "source" },
    );
    expect(csv).toContain(`"'=HYPERLINK(""http://evil.example"",""x"")",1`);
    expect(csv).toContain(`"'+1-555",2`);
    expect(csv).toContain('"He said ""hi""",3');
  });
});

import { summarizeVisualRows } from "./visuals";

describe("summarizeVisualRows", () => {
  it("totals additive measures and finds the peak, average and latest of a time series", () => {
    const rows = [
      { label: "2026-01-01", value: 2 },
      { label: "2026-01-02", value: 8 },
      { label: "2026-01-03", value: 5 },
    ];
    expect(summarizeVisualRows(rows, { measure: "mentions", dimension: "day" })).toEqual({
      total: 15,
      peak: { label: "2026-01-02", value: 8 },
      average: 5,
      latest: 5,
    });
  });

  it("does not total non-additive measures or count an undefined share as zero", () => {
    const rows = [
      { label: "a", value: 40 },
      { label: "b", value: null },
      { label: "c", value: 10 },
    ];
    const result = summarizeVisualRows(rows, { measure: "negative_share", dimension: "source" });
    expect(result.total).toBeNull();
    expect(result.peak).toEqual({ label: "a", value: 40 });
    expect(result.average).toBeNull(); // not a time series
    expect(summarizeVisualRows([], { measure: "mentions", dimension: "day" })).toEqual({
      total: null,
      peak: null,
      average: null,
      latest: null,
    });
  });
});

import { csvForExcel } from "./visuals";

describe("csvForExcel", () => {
  it("adds a byte-order mark and a separator hint so Excel splits the columns", () => {
    const csv = csvForExcel('"Source","Mentions"\r\n"Ç",1\r\n');
    expect(csv.startsWith("\uFEFFsep=,\r\n")).toBe(true);
    expect(csv.endsWith('"Ç",1\r\n')).toBe(true);
  });
});
