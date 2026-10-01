import { describe, expect, it, vi } from "vitest";
import type { Queue } from "bullmq";
import type { CrawlSourceJobData } from "@cim/core";

/**
 * A pure unit test (mocking @cim/db entirely, no real Postgres) — same
 * rationale as enforce-retention.test.ts. Proves one source's queue.add
 * failure doesn't stop every source ordered after it from being enqueued
 * for this tick (previously a plain Promise.all aborted the whole tick).
 */
const listActiveSources = vi.fn();

vi.mock("@cim/db", () => ({
  db: {},
  listActiveSources: (...args: unknown[]) => listActiveSources(...args),
}));

const { processCrawlSchedulerJob } = await import("./crawl-scheduler");

describe("processCrawlSchedulerJob — per-source failure isolation", () => {
  it("still enqueues source 2 when source 1's queue.add rejects", async () => {
    listActiveSources.mockResolvedValueOnce([
      { id: "source-1", connector: "rss", lastCheckedAt: null },
      { id: "source-2", connector: "rss", lastCheckedAt: null },
    ]);

    const add = vi
      .fn()
      .mockRejectedValueOnce(new Error("transient Redis error"))
      .mockResolvedValueOnce(undefined);
    const crawlSourceQueue = { add } as unknown as Queue<CrawlSourceJobData>;

    await processCrawlSchedulerJob(crawlSourceQueue);

    expect(add).toHaveBeenCalledTimes(2);
  });
});

describe("processCrawlSchedulerJob — crawl interval", () => {
  it("only enqueues sources that are due, so a real site is not polled every tick", async () => {
    const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);
    listActiveSources.mockResolvedValueOnce([
      { id: "never-checked", connector: "rss", lastCheckedAt: null },
      { id: "fresh-rss", connector: "rss", lastCheckedAt: minutesAgo(2) },
      { id: "stale-rss", connector: "rss", lastCheckedAt: minutesAgo(121) },
      { id: "fresh-sitemap", connector: "sitemap", lastCheckedAt: minutesAgo(90) },
      { id: "mock", connector: "mock", lastCheckedAt: new Date(Date.now() - 31_000) },
    ]);
    const add = vi.fn().mockResolvedValue(undefined);

    await processCrawlSchedulerJob({ add } as unknown as Queue<CrawlSourceJobData>);

    const enqueued = add.mock.calls.map(([, data]) => (data as CrawlSourceJobData).sourceId);
    expect(enqueued.sort()).toEqual(["mock", "never-checked", "stale-rss"]);
  });
});
