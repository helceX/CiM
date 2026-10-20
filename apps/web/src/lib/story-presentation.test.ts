import { describe, expect, it } from "vitest";
import { groupStoryRows, sentimentCoverage, sentimentNetScore } from "./story-presentation";

describe("dashboard story grouping", () => {
  it("keeps the latest representative, folds shared articles/clusters and leaves unrelated equal titles alone", () => {
    const row = (id: string, cluster: string | null = null) => ({ article: { id, storyClusterId: cluster, title: "Same headline" } });
    const latest = row("a", "story");
    expect(groupStoryRows([latest, row("b", "story"), row("c"), row("c"), row("d")], 10)).toEqual([
      { representative: latest, matches: 2 }, { representative: row("c"), matches: 2 }, { representative: row("d"), matches: 1 },
    ]);
    expect(groupStoryRows([row("a"), row("b")], 1)).toHaveLength(1);
  });
});
describe("sentiment coverage", () => {
  it("distinguishes no data, no analysis and partial analysis without counting unknown as neutral", () => {
    expect(sentimentCoverage({ totalMentions: 0, positive: 0, neutral: 0, negative: 0 }).percent).toBeNull();
    expect(sentimentCoverage({ totalMentions: 10, positive: 0, neutral: 0, negative: 0 })).toEqual({ classified: 0, unclassified: 10, percent: 0 });
    expect(sentimentCoverage({ totalMentions: 10, positive: 1, neutral: 2, negative: 1 })).toEqual({ classified: 4, unclassified: 6, percent: 40 });
    expect(sentimentNetScore({ positive: 0, neutral: 0, negative: 0 })).toBeNull();
    expect(sentimentNetScore({ positive: 0, neutral: 0, negative: 1 })).toBe(-100);
  });
});
