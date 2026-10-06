import { describe, expect, it } from "vitest";
import { crawlConcurrency } from "./crawl-concurrency";

describe("crawlConcurrency", () => {
  it("defaults to 15 and accepts a sensible override", () => {
    expect(crawlConcurrency({})).toBe(15);
    expect(crawlConcurrency({ CRAWL_CONCURRENCY: "8" })).toBe(8);
  });

  it("ignores values that are not whole numbers from 1 to 40", () => {
    for (const bad of ["0", "-1", "abc", "2.5", "41", ""]) expect(crawlConcurrency({ CRAWL_CONCURRENCY: bad })).toBe(15);
  });
});
