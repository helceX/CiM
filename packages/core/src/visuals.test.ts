import { describe, expect, it } from "vitest";
import { fillTimeBuckets, suggestChartTypes } from "./visuals";

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
