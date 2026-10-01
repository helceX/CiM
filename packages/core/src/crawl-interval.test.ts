import { describe, expect, it } from "vitest";
import { crawlIntervalMs, isSourceDue } from "./crawl-interval";

const now = new Date("2026-10-01T12:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms);

describe("crawlIntervalMs", () => {
  it("polls real sites no more often than every 10 minutes", () => {
    for (const connector of ["rss", "sitemap", "web", "api", "something-new"]) {
      expect(crawlIntervalMs(connector)).toBeGreaterThanOrEqual(10 * 60_000);
    }
  });
  it("lets only the synthetic connectors run on the 30 s tick", () => {
    expect(crawlIntervalMs("mock")).toBeLessThan(30_000);
    expect(crawlIntervalMs("mock-social")).toBeLessThan(30_000);
  });
});

describe("isSourceDue", () => {
  it("is due when never checked", () => {
    expect(isSourceDue({ connector: "rss", lastCheckedAt: null }, now)).toBe(true);
  });
  it("is not due inside the interval and is due at/after it", () => {
    expect(isSourceDue({ connector: "rss", lastCheckedAt: ago(9 * 60_000) }, now)).toBe(false);
    expect(isSourceDue({ connector: "rss", lastCheckedAt: ago(10 * 60_000) }, now)).toBe(true);
    expect(isSourceDue({ connector: "sitemap", lastCheckedAt: ago(20 * 60_000) }, now)).toBe(false);
  });
});
