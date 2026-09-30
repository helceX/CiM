import { describe, expect, it } from "vitest";
import { BRAND_GROUP_COLORS, netSentiment, nextGroupColor, shareOfVoice } from "./brand-groups";

describe("shareOfVoice", () => {
  it("divides each group by the total of the compared groups", () => {
    const rows = shareOfVoice([
      { name: "Us", totalMentions: 30 },
      { name: "Rival", totalMentions: 10 },
    ]);
    expect(rows.map((r) => r.shareOfVoice)).toEqual([0.75, 0.25]);
  });

  it("returns null (not 0) for everyone when nothing was mentioned", () => {
    const rows = shareOfVoice([{ totalMentions: 0 }, { totalMentions: 0 }]);
    expect(rows.map((r) => r.shareOfVoice)).toEqual([null, null]);
  });

  it("gives a silent group 0 when others were mentioned", () => {
    const rows = shareOfVoice([{ totalMentions: 5 }, { totalMentions: 0 }]);
    expect(rows.map((r) => r.shareOfVoice)).toEqual([1, 0]);
  });

  it("sums to 1 across groups", () => {
    const rows = shareOfVoice([{ totalMentions: 7 }, { totalMentions: 11 }, { totalMentions: 3 }]);
    expect(rows.reduce((s, r) => s + (r.shareOfVoice ?? 0), 0)).toBeCloseTo(1, 10);
  });

  it("handles no groups", () => {
    expect(shareOfVoice([])).toEqual([]);
  });
});

describe("netSentiment", () => {
  it("is (positive − negative) ÷ total", () => {
    expect(netSentiment({ positive: 6, negative: 2, totalMentions: 10 })).toBeCloseTo(0.4);
    expect(netSentiment({ positive: 0, negative: 5, totalMentions: 5 })).toBe(-1);
  });
  it("is null with no mentions", () => {
    expect(netSentiment({ positive: 0, negative: 0, totalMentions: 0 })).toBeNull();
  });
});

describe("nextGroupColor", () => {
  it("returns the first unused palette colour in fixed order", () => {
    expect(nextGroupColor([])).toBe("blue");
    expect(nextGroupColor(["blue", "aqua"])).toBe("orange");
  });
  it("wraps once every colour is taken", () => {
    expect(nextGroupColor([...BRAND_GROUP_COLORS])).toBe("blue");
  });
});
