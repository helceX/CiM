import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Job, Queue } from "bullmq";
import type { CrawlSourceJobData, SendEmailJobData } from "@cim/core";

/**
 * Pure unit test (no Postgres): a crawl job for a source that was checked
 * recently must not touch the publisher again — that is what makes a backlog of
 * stale queued jobs harmless — while a retry of a failed attempt still runs.
 */
const selectResult = vi.fn();
const markSourceChecked = vi.fn();
const healthCheck = vi.fn();
const fetchItems = vi.fn();

vi.mock("@cim/db", () => ({
  db: { select: () => ({ from: () => ({ where: () => selectResult() }) }) },
  schema: { sources: { id: "id" } },
  markSourceChecked: (...args: unknown[]) => markSourceChecked(...args),
}));
vi.mock("../connector-registry", () => ({
  getConnectorFor: () => ({ healthCheck: (...a: unknown[]) => healthCheck(...a), fetch: (...a: unknown[]) => fetchItems(...a) }),
}));
vi.mock("@cim/ingestion", () => ({
  ingestSource: async () => ({ itemsFetched: 0, articlesCreated: 0, mentionsCreated: 0, newMentions: [] }),
}));
vi.mock("../alerts/evaluate", () => ({ evaluateNewMentionAlerts: vi.fn() }));

const { processCrawlSourceJob } = await import("./crawl-source");

const emailQueue = {} as Queue<SendEmailJobData>;
const job = (attemptsMade: number) => ({ data: { sourceId: "s1" }, attemptsMade }) as unknown as Job<CrawlSourceJobData>;
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);

beforeEach(() => {
  vi.clearAllMocks();
  healthCheck.mockResolvedValue({ status: "healthy" });
});

describe("processCrawlSourceJob — stale queued jobs", () => {
  it("does nothing for a source that was checked minutes ago (first attempt)", async () => {
    selectResult.mockResolvedValue([{ id: "s1", name: "Feed", connector: "rss", lastCheckedAt: minutesAgo(5) }]);
    await processCrawlSourceJob(job(0), emailQueue);
    expect(healthCheck).not.toHaveBeenCalled();
    expect(markSourceChecked).not.toHaveBeenCalled();
  });

  it("crawls a source whose interval has passed, and one never checked", async () => {
    selectResult.mockResolvedValueOnce([{ id: "s1", name: "Feed", connector: "rss", lastCheckedAt: minutesAgo(125) }]);
    await processCrawlSourceJob(job(0), emailQueue);
    selectResult.mockResolvedValueOnce([{ id: "s1", name: "Feed", connector: "rss", lastCheckedAt: null }]);
    await processCrawlSourceJob(job(0), emailQueue);
    expect(healthCheck).toHaveBeenCalledTimes(2);
    expect(markSourceChecked).toHaveBeenCalledWith(expect.anything(), "s1", "healthy");
  });

  it("still runs a retry of a failed attempt, although that attempt recorded a check", async () => {
    selectResult.mockResolvedValue([{ id: "s1", name: "Feed", connector: "rss", lastCheckedAt: minutesAgo(0.1) }]);
    await processCrawlSourceJob(job(1), emailQueue);
    expect(healthCheck).toHaveBeenCalledTimes(1);
  });
});
