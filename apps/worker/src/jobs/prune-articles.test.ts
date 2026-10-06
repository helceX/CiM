import { describe, expect, it } from "vitest";
import { articleCacheDays, effectiveCacheDays } from "./prune-articles";

describe("articleCacheDays", () => {
  it("defaults to 14 and accepts a sensible override", () => {
    expect(articleCacheDays({})).toBe(14);
    expect(articleCacheDays({ ARTICLE_CACHE_DAYS: "7" })).toBe(7);
  });
  it("ignores nonsense so a typo can never mean 'delete everything'", () => {
    for (const bad of ["0", "-3", "abc", "2.5", "9999", ""]) expect(articleCacheDays({ ARTICLE_CACHE_DAYS: bad })).toBe(14);
  });
});

describe("effectiveCacheDays", () => {
  it("keeps the configured window while the disk has room, or when the volume size is unknown", () => {
    expect(effectiveCacheDays(28, 2_000, 10_000)).toBe(28);
    expect(effectiveCacheDays(28, 7_000, 10_000)).toBe(28); // exactly 70%
    expect(effectiveCacheDays(28, 9_000, 0)).toBe(28);
    expect(effectiveCacheDays(28, 9_000, Number.NaN)).toBe(28);
  });
  it("shortens it as the volume fills, and never lengthens it", () => {
    expect(effectiveCacheDays(28, 7_500, 10_000)).toBe(7);
    expect(effectiveCacheDays(28, 9_000, 10_000)).toBe(3);
    expect(effectiveCacheDays(5, 7_500, 10_000)).toBe(5);
    expect(effectiveCacheDays(2, 9_000, 10_000)).toBe(2);
  });
});
