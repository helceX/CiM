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
    listActiveSources.mockResolvedValueOnce([{ id: "source-1" }, { id: "source-2" }]);

    const add = vi
      .fn()
      .mockRejectedValueOnce(new Error("transient Redis error"))
      .mockResolvedValueOnce(undefined);
    const crawlSourceQueue = { add } as unknown as Queue<CrawlSourceJobData>;

    await processCrawlSchedulerJob(crawlSourceQueue);

    expect(add).toHaveBeenCalledTimes(2);
  });
});
