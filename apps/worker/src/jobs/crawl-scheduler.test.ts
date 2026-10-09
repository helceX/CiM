import { describe, expect, it, vi } from "vitest";
import type { Queue } from "bullmq";
import type { CrawlSourceJobData } from "@cim/core";

/**
 * A pure unit test (mocking @cim/db entirely, no real Postgres) — same
 * rationale as enforce-retention.test.ts. Proves one source's queue.add
 * failure doesn't stop every source ordered after it from being enqueued
 * for this tick (previously a plain Promise.all aborted the whole tick).
 */
const listDueSources = vi.fn();

vi.mock("@cim/db", () => ({
  db: {},
  listDueSources: (...args: unknown[]) => listDueSources(...args),
}));

const { processCrawlSchedulerJob } = await import("./crawl-scheduler");

describe("processCrawlSchedulerJob — per-source failure isolation", () => {
  it("still enqueues source 2 when source 1's queue.add rejects", async () => {
    listDueSources.mockResolvedValueOnce([
      { id: "source-1", connector: "rss", lastCheckedAt: null },
      { id: "source-2", connector: "rss", lastCheckedAt: null },
    ]);

    const add = vi
      .fn()
      .mockRejectedValueOnce(new Error("transient Redis error"))
      .mockResolvedValueOnce(undefined);
    const crawlSourceQueue = { add, getJob: vi.fn().mockResolvedValue(undefined) } as unknown as Queue<CrawlSourceJobData>;

    await processCrawlSchedulerJob(crawlSourceQueue);

    expect(add).toHaveBeenCalledTimes(2);
  });
});

describe("processCrawlSchedulerJob — crawl interval", () => {
  it("only enqueues sources that are due, so a real site is not polled every tick", async () => {
    const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);
    listDueSources.mockResolvedValueOnce([
      { id: "never-checked", connector: "rss", lastCheckedAt: null },
      { id: "fresh-rss", connector: "rss", lastCheckedAt: minutesAgo(2) },
      { id: "stale-rss", connector: "rss", lastCheckedAt: minutesAgo(121) },
      { id: "fresh-sitemap", connector: "sitemap", lastCheckedAt: minutesAgo(90) },
      { id: "mock", connector: "mock", lastCheckedAt: new Date(Date.now() - 31_000) },
    ]);
    const add = vi.fn().mockResolvedValue(undefined);

    await processCrawlSchedulerJob({ add, getJob: vi.fn().mockResolvedValue(undefined) } as unknown as Queue<CrawlSourceJobData>);

    const enqueued = add.mock.calls.map(([, data]) => (data as CrawlSourceJobData).sourceId);
    expect(enqueued.sort()).toEqual(["mock", "never-checked", "stale-rss"]);
  });
});

describe("processCrawlSchedulerJob — no duplicate jobs for a busy queue", () => {
  const job = (state: string) => ({ getState: vi.fn().mockResolvedValue(state), remove: vi.fn().mockResolvedValue(undefined) });

  it("does not queue a source again while its job is waiting, running or delayed", async () => {
    listDueSources.mockResolvedValueOnce([
      { id: "waiting", connector: "rss", lastCheckedAt: null },
      { id: "active", connector: "rss", lastCheckedAt: null },
      { id: "delayed", connector: "rss", lastCheckedAt: null },
    ]);
    const jobs: Record<string, ReturnType<typeof job>> = {
      "crawl-waiting": job("waiting"),
      "crawl-active": job("active"),
      "crawl-delayed": job("delayed"),
    };
    const add = vi.fn().mockResolvedValue(undefined);
    const getJob = vi.fn(async (id: string) => jobs[id]);

    await processCrawlSchedulerJob({ add, getJob } as unknown as Queue<CrawlSourceJobData>);

    expect(add).not.toHaveBeenCalled();
    expect(Object.values(jobs).every((j) => j.remove.mock.calls.length === 0)).toBe(true);
  });

  it("reuses the id once the previous job has finished, clearing its record first", async () => {
    listDueSources.mockResolvedValueOnce([
      { id: "done", connector: "rss", lastCheckedAt: null },
      { id: "failed", connector: "rss", lastCheckedAt: null },
    ]);
    const jobs: Record<string, ReturnType<typeof job>> = { "crawl-done": job("completed"), "crawl-failed": job("failed") };
    const add = vi.fn().mockResolvedValue(undefined);

    await processCrawlSchedulerJob({ add, getJob: vi.fn(async (id: string) => jobs[id]) } as unknown as Queue<CrawlSourceJobData>);

    expect(jobs["crawl-done"]!.remove).toHaveBeenCalledTimes(1);
    expect(jobs["crawl-failed"]!.remove).toHaveBeenCalledTimes(1);
    expect(add.mock.calls.map((call) => (call[2] as { jobId: string }).jobId).sort()).toEqual(["crawl-done", "crawl-failed"]);
  });

  it("uses one stable job id per source, not one per tick", async () => {
    listDueSources.mockResolvedValue([{ id: "s1", connector: "rss", lastCheckedAt: null }]);
    const add = vi.fn().mockResolvedValue(undefined);
    const queue = { add, getJob: vi.fn().mockResolvedValue(undefined) } as unknown as Queue<CrawlSourceJobData>;
    await processCrawlSchedulerJob(queue);
    await processCrawlSchedulerJob(queue);
    const ids = add.mock.calls.map((call) => (call[2] as { jobId: string }).jobId);
    expect(new Set(ids)).toEqual(new Set(["crawl-s1"]));
  });
});
