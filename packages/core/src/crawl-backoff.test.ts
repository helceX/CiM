import { describe, expect, it } from "vitest";
import { CRAWL_BACKOFF_CAP_MS, crawlBackoffMs, parseRetryAfter } from "./crawl-backoff";

const TWO_HOURS = 2 * 3_600_000;

describe("crawlBackoffMs", () => {
  it("does not penalise the first failure, then doubles, up to a day", () => {
    const hours = [1, 2, 3, 4, 5, 6, 20].map((n) => crawlBackoffMs(n, TWO_HOURS) / 3_600_000);
    expect(hours).toEqual([2, 4, 8, 16, 24, 24, 24]);
    expect(crawlBackoffMs(50, TWO_HOURS)).toBe(CRAWL_BACKOFF_CAP_MS);
  });

  it("honours a Retry-After that asks for longer, but never for more than a day", () => {
    expect(crawlBackoffMs(1, TWO_HOURS, 6 * 3_600_000)).toBe(6 * 3_600_000);
    expect(crawlBackoffMs(3, TWO_HOURS, 3_600_000)).toBe(8 * 3_600_000); // the longer of the two
    expect(crawlBackoffMs(1, TWO_HOURS, 10 * 24 * 3_600_000)).toBe(CRAWL_BACKOFF_CAP_MS);
    expect(crawlBackoffMs(1, TWO_HOURS, null)).toBe(TWO_HOURS);
  });
});

describe("parseRetryAfter", () => {
  const now = new Date("2026-10-09T12:00:00Z");
  it("reads seconds and HTTP dates", () => {
    expect(parseRetryAfter("120", now)).toBe(120_000);
    expect(parseRetryAfter("Fri, 09 Oct 2026 13:00:00 GMT", now)).toBe(3_600_000);
    expect(parseRetryAfter("Fri, 09 Oct 2026 11:00:00 GMT", now)).toBe(0);
  });
  it("is null for nothing or nonsense", () => {
    expect(parseRetryAfter(undefined, now)).toBeNull();
    expect(parseRetryAfter("", now)).toBeNull();
    expect(parseRetryAfter("soon", now)).toBeNull();
  });
});
