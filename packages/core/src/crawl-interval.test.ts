import { describe, expect, it } from "vitest";
import { crawlIntervalMs, crawlIntervalTable, crawlSchedulerIntervalMs, isSourceDue } from "./crawl-interval";

const now = new Date("2026-10-01T12:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms);

describe("crawlIntervalMs", () => {
  it("polls every real connector and the fallback every eight hours", () => {
    for (const connector of ["rss", "sitemap", "web", "api", "google-trends", "bluesky-search", "something-new"]) {
      expect(crawlIntervalMs(connector)).toBe(8 * 60 * 60_000);
      expect(crawlIntervalTable().byConnector[connector] ?? crawlIntervalTable().fallbackMs).toBe(crawlIntervalMs(connector));
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
    expect(isSourceDue({ connector: "rss", lastCheckedAt: ago(2 * 60 * 60_000) }, now)).toBe(false);
    expect(isSourceDue({ connector: "rss", lastCheckedAt: ago(8 * 60 * 60_000 - 1) }, now)).toBe(false);
    expect(isSourceDue({ connector: "rss", lastCheckedAt: ago(8 * 60 * 60_000) }, now)).toBe(true);
    expect(isSourceDue({ connector: "rss", lastCheckedAt: ago(8 * 60 * 60_000 + 1) }, now)).toBe(true);
    expect(isSourceDue({ connector: "sitemap", lastCheckedAt: ago(60 * 60_000) }, now)).toBe(false);
  });
});

describe("crawlSchedulerIntervalMs", () => {
  it("checks due sources every five minutes in production and keeps demos responsive", () => {
    expect(crawlSchedulerIntervalMs("production")).toBe(5 * 60_000);
    expect(crawlSchedulerIntervalMs("development")).toBe(30_000);
    expect(crawlSchedulerIntervalMs("test")).toBe(30_000);
    expect(crawlSchedulerIntervalMs(undefined)).toBe(30_000);
  });
});
