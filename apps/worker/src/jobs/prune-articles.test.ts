import { describe, expect, it } from "vitest";
import { articleCacheDays } from "./prune-articles";

describe("articleCacheDays", () => {
  it("defaults to 14 and accepts a sensible override", () => {
    expect(articleCacheDays({})).toBe(14);
    expect(articleCacheDays({ ARTICLE_CACHE_DAYS: "7" })).toBe(7);
  });
  it("ignores nonsense so a typo can never mean 'delete everything'", () => {
    for (const bad of ["0", "-3", "abc", "2.5", "9999", ""]) expect(articleCacheDays({ ARTICLE_CACHE_DAYS: bad })).toBe(14);
  });
});
