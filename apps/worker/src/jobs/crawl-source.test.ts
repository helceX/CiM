import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Job, Queue } from "bullmq";
import type { CrawlSourceJobData, SendEmailJobData } from "@cim/core";
import { memoryCrawlStateStore } from "../crawl-state";

/**
 * Pure unit test (no Postgres): a crawl job for a source that was checked
 * recently must not touch the publisher again — that is what makes a backlog of
 * stale queued jobs harmless — while a retry of a failed attempt still runs.
 */
const selectResult = vi.fn();
const markSourceChecked = vi.fn();
const healthCheck = vi.fn();
const fetchItems = vi.fn();
const ingestSource = vi.fn();

vi.mock("@cim/db", () => ({
  db: { select: () => ({ from: () => ({ where: () => selectResult() }) }) },
  schema: { sources: { id: "id" } },
  markSourceChecked: (...args: unknown[]) => markSourceChecked(...args),
}));
vi.mock("../connector-registry", () => ({
  getConnectorFor: () => ({ healthCheck: (...a: unknown[]) => healthCheck(...a), fetch: (...a: unknown[]) => fetchItems(...a) }),
}));
vi.mock("@cim/ingestion", () => ({
  ingestSource: (...args: unknown[]) => ingestSource(...args),
  // the monitorings' signature: changes when the set of monitorings does (here: their ids joined)
  crawlSignature: (_source: unknown, queries: { id: string }[]) => queries.map((q) => q.id).join(","),
}));
vi.mock("../alerts/evaluate", () => ({ evaluateNewMentionAlerts: vi.fn() }));

const { processCrawlSourceJob } = await import("./crawl-source");

const emailQueue = {} as Queue<SendEmailJobData>;
const job = (attemptsMade: number) => ({ data: { sourceId: "s1" }, attemptsMade }) as unknown as Job<CrawlSourceJobData>;
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);

const EMPTY_RESULT = { itemsFetched: 0, itemsSkipped: 0, itemKeys: [] as string[], articlesCreated: 0, mentionsCreated: 0, newMentions: [] };
const stats = vi.fn();
let queries = [{ id: "q1" }];
const state = memoryCrawlStateStore();
const deps = (extra: Record<string, unknown> = {}) => ({
  state,
  stats: (...a: unknown[]) => stats(...a),
  activeQueries: async () => queries as never,
  now: () => NOW,
  ...extra,
});
const NOW = Date.parse("2026-10-09T12:00:00Z");
const HOUR = 3_600_000;
const staleSource = { id: "s1", name: "Feed", connector: "rss", status: "healthy", type: "news", lastCheckedAt: minutesAgo(125) };

beforeEach(() => {
  vi.clearAllMocks();
  state.states.clear();
  queries = [{ id: "q1" }];
  healthCheck.mockResolvedValue({ status: "healthy" });
  ingestSource.mockResolvedValue(EMPTY_RESULT);
});

describe("processCrawlSourceJob — stale queued jobs", () => {
  it("does nothing for a source that was checked minutes ago (first attempt)", async () => {
    selectResult.mockResolvedValue([{ id: "s1", name: "Feed", connector: "rss", lastCheckedAt: minutesAgo(5) }]);
    await processCrawlSourceJob(job(0), emailQueue, deps());
    expect(healthCheck).not.toHaveBeenCalled();
    expect(markSourceChecked).not.toHaveBeenCalled();
  });

  it("crawls a source whose interval has passed, and one never checked", async () => {
    selectResult.mockResolvedValueOnce([{ id: "s1", name: "Feed", connector: "rss", lastCheckedAt: minutesAgo(125) }]);
    await processCrawlSourceJob(job(0), emailQueue, deps());
    selectResult.mockResolvedValueOnce([{ id: "s1", name: "Feed", connector: "rss", lastCheckedAt: null }]);
    await processCrawlSourceJob(job(0), emailQueue, deps());
    expect(healthCheck).toHaveBeenCalledTimes(2);
    expect(markSourceChecked).toHaveBeenCalledWith(expect.anything(), "s1", "healthy");
  });

  it("still runs a retry of a failed attempt, although that attempt recorded a check", async () => {
    selectResult.mockResolvedValue([{ id: "s1", name: "Feed", connector: "rss", lastCheckedAt: minutesAgo(0.1) }]);
    await processCrawlSourceJob(job(1), emailQueue, deps());
    expect(healthCheck).toHaveBeenCalledTimes(1);
  });
});

describe("processCrawlSourceJob — what a crawl remembers", () => {
  const remembered = (over: Record<string, unknown> = {}) => ({
    sig: "q1",
    seen: ["a", "b"],
    validators: { etag: '"v1"' },
    fullAt: NOW - HOUR,
    failures: 0,
    ...over,
  });

  it("asks with the publisher's validators, and ends the crawl at a 304 without ingesting", async () => {
    selectResult.mockResolvedValue([staleSource]);
    state.states.set("s1", remembered({ failures: 3 }));
    healthCheck.mockResolvedValue({ status: "healthy", notModified: true });

    await processCrawlSourceJob(job(0), emailQueue, deps());

    expect(healthCheck).toHaveBeenCalledWith(expect.anything(), { validators: { etag: '"v1"' } });
    expect(ingestSource).not.toHaveBeenCalled();
    expect(markSourceChecked).toHaveBeenCalledWith(expect.anything(), "s1", "healthy");
    expect(state.states.get("s1")).toMatchObject({ failures: 0, seen: ["a", "b"] });
    expect(stats).toHaveBeenCalledWith({ checks: 1, not_modified: 1 });
  });

  it("skips the stories it already handled, and remembers the feed (with the new validators) only after ingesting it", async () => {
    selectResult.mockResolvedValue([staleSource]);
    state.states.set("s1", remembered());
    healthCheck.mockResolvedValue({ status: "healthy", validators: { etag: '"v2"' } });
    ingestSource.mockResolvedValue({ ...EMPTY_RESULT, itemsFetched: 3, itemsSkipped: 2, itemKeys: ["a", "b", "c"], articlesCreated: 1 });

    await processCrawlSourceJob(job(0), emailQueue, deps());

    const options = ingestSource.mock.calls[0]![3] as { skipKeys: Set<string> };
    expect([...options.skipKeys]).toEqual(["a", "b"]);
    expect(state.states.get("s1")).toEqual({ sig: "q1", seen: ["a", "b", "c"], validators: { etag: '"v2"' }, fullAt: NOW - HOUR, failures: 0 });
    expect(stats).toHaveBeenCalledWith(expect.objectContaining({ checks: 1, changed: 1, stories_seen: 3, stories_skipped: 2, new_articles: 1 }));
  });

  it("remembers nothing from a crawl that failed part-way", async () => {
    selectResult.mockResolvedValue([staleSource]);
    state.states.set("s1", remembered());
    healthCheck.mockResolvedValue({ status: "healthy", validators: { etag: '"v2"' } });
    ingestSource.mockRejectedValue(new Error("database went away"));

    await expect(processCrawlSourceJob(job(0), emailQueue, deps())).rejects.toThrow("database went away");

    expect(state.states.get("s1")).toEqual(remembered());
    expect(markSourceChecked).toHaveBeenCalledWith(expect.anything(), "s1", "error");
  });

  it("looks at the whole feed again when the monitorings changed, or when the last full pass is over a day old", async () => {
    selectResult.mockResolvedValue([staleSource]);
    state.states.set("s1", remembered());
    queries = [{ id: "q1" }, { id: "q2" }]; // a monitoring was added

    await processCrawlSourceJob(job(0), emailQueue, deps());
    expect(healthCheck).toHaveBeenLastCalledWith(expect.anything(), undefined);
    expect((ingestSource.mock.calls[0]![3] as { skipKeys?: Set<string> }).skipKeys).toBeUndefined();
    expect(state.states.get("s1")).toMatchObject({ sig: "q1,q2", fullAt: NOW });

    state.states.set("s1", remembered({ sig: "q1,q2", fullAt: NOW - 25 * HOUR }));
    await processCrawlSourceJob(job(0), emailQueue, deps());
    expect(healthCheck).toHaveBeenLastCalledWith(expect.anything(), undefined);
    expect(state.states.get("s1")).toMatchObject({ fullAt: NOW });
  });

  it("waits longer after repeated failures without contacting the publisher, and starts over after a success", async () => {
    selectResult.mockResolvedValue([staleSource]);
    healthCheck.mockResolvedValue({ status: "error", message: "Feed responded HTTP 500" });

    await processCrawlSourceJob(job(0), emailQueue, deps()); // 1st failure: normal cadence
    expect(state.states.get("s1")).toMatchObject({ failures: 1, nextAt: NOW + 2 * HOUR });
    await processCrawlSourceJob(job(0), emailQueue, deps({ now: () => NOW + 2 * HOUR })); // 2nd: 4 h
    expect(state.states.get("s1")).toMatchObject({ failures: 2, nextAt: NOW + 6 * HOUR });
    expect(healthCheck).toHaveBeenCalledTimes(2);

    // two hours later it is still inside the wait: the publisher is not asked, the check is recorded
    healthCheck.mockClear();
    markSourceChecked.mockClear();
    await processCrawlSourceJob(job(0), emailQueue, deps({ now: () => NOW + 4 * HOUR }));
    expect(healthCheck).not.toHaveBeenCalled();
    expect(markSourceChecked).toHaveBeenCalledWith(expect.anything(), "s1", "healthy");
    expect(stats).toHaveBeenLastCalledWith({ backoff_skips: 1 });

    // once the wait is over it asks again; a success resets the count
    healthCheck.mockResolvedValue({ status: "healthy" });
    await processCrawlSourceJob(job(0), emailQueue, deps({ now: () => NOW + 7 * HOUR }));
    expect(state.states.get("s1")).toMatchObject({ failures: 0 });
    expect(state.states.get("s1")?.nextAt).toBeUndefined();
  });

  it("honours a Retry-After that asks for longer than the normal wait", async () => {
    selectResult.mockResolvedValue([staleSource]);
    healthCheck.mockResolvedValue({ status: "error", message: "Feed responded HTTP 429", retryAfterMs: 6 * HOUR });
    await processCrawlSourceJob(job(0), emailQueue, deps());
    expect(state.states.get("s1")).toMatchObject({ failures: 1, nextAt: NOW + 6 * HOUR });
  });

  it("does not wait on a retry of a failed attempt", async () => {
    selectResult.mockResolvedValue([staleSource]);
    state.states.set("s1", remembered({ failures: 2, nextAt: NOW + 3 * HOUR }));
    await processCrawlSourceJob(job(1), emailQueue, deps());
    expect(healthCheck).toHaveBeenCalledTimes(1);
  });
});
