import { describe, expect, it } from "vitest";
import { STORY_WINDOW_HOURS, clusterQueryWords, isWithinStoryWindow, toTsQueryAny } from "./story-cluster";

describe("clusterQueryWords", () => {
  it("picks the longest distinct words, folded like the full-text index, at most six", () => {
    expect(clusterQueryWords("İSTANBUL'da Merkez Bankası faiz kararını açıkladı, piyasalar yükseldi")).toEqual([
      "açıkladı",
      "bankası",
      "kararını",
      "piyasalar",
      "yükseldi",
      "istanbul",
    ].sort((a, b) => b.length - a.length || a.localeCompare(b)).slice(0, 6));
  });

  it("is the same list for the same headline, whatever the case", () => {
    expect(clusterQueryWords("ASELSAN Yeni Radar Sistemini Tanıttı")).toEqual(clusterQueryWords("aselsan yeni radar sistemini tanıttı"));
  });

  it("ignores numbers alone and falls back to short words when nothing is long enough", () => {
    expect(clusterQueryWords("2026 2027 12")).toEqual([]);
    expect(clusterQueryWords("Gol var ama VAR yok")).toEqual(["var", "ama", "gol", "yok"].sort((a, b) => b.length - a.length || a.localeCompare(b)));
    expect(clusterQueryWords("")).toEqual([]);
  });

  it("builds a query that cannot be broken out of", () => {
    expect(toTsQueryAny(clusterQueryWords("O'Reilly'nin \"tırnaklı\" ; drop table başlık!"))).not.toMatch(/[;"]/);
    expect(toTsQueryAny(["abc", "dÃ¼n"])).toBe("'abc' | 'dÃ¼n'");
  });
});

describe("isWithinStoryWindow", () => {
  const now = new Date("2026-10-09T12:00:00Z");
  it("clusters fresh stories and stories without a date, not a back catalogue", () => {
    expect(isWithinStoryWindow(new Date(now.getTime() - 3_600_000), now)).toBe(true);
    expect(isWithinStoryWindow(null, now)).toBe(true);
    expect(isWithinStoryWindow(new Date(now.getTime() - (STORY_WINDOW_HOURS + 1) * 3_600_000), now)).toBe(false);
  });
});
