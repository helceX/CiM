import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Full-mock unit test (apps/worker/src/ai/enrich.test.ts pattern) — proves
 * admin-queues.ts reuses one BullMQ Queue per queue name across calls
 * instead of constructing (and closing) a fresh one every time, matching
 * the singleton pattern in ./email.ts's getSendEmailQueue. Constructing a
 * BullMQ Queue does real connection setup, so doing it on every admin page
 * load (getQueueHealth polls every known queue) is wasted work under load.
 */
const constructedQueueNames: string[] = [];

vi.mock("bullmq", () => {
  class MockQueue {
    name: string;
    getJobCounts = vi
      .fn()
      .mockResolvedValue({
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
        delayed: 0,
      });
    getJobs = vi.fn().mockResolvedValue([]);
    toKey = (type: string) => `bull:${this.name}:${type}`;
    close = vi.fn().mockResolvedValue(undefined);
    constructor(name: string) {
      this.name = name;
      constructedQueueNames.push(name);
    }
  }
  return { Queue: MockQueue };
});

const { zcount } = vi.hoisted(() => ({ zcount: vi.fn().mockResolvedValue(2) }));
vi.mock("./redis", () => ({ getRedis: () => ({ zcount }) }));

import { getFailedJobsForQueue, getQueueHealth } from "./admin-queues";

describe("admin-queues Queue caching", () => {
  beforeEach(() => {
    constructedQueueNames.length = 0;
  });

  it("constructs a Queue for a given name only once, reusing it on later calls", async () => {
    await getFailedJobsForQueue("cache-test-queue");
    await getFailedJobsForQueue("cache-test-queue");
    await getFailedJobsForQueue("cache-test-queue");

    expect(
      constructedQueueNames.filter((name) => name === "cache-test-queue"),
    ).toHaveLength(1);
  });

  it("still constructs separate Queues for distinct queue names", async () => {
    await getFailedJobsForQueue("cache-test-queue-a");
    await getFailedJobsForQueue("cache-test-queue-b");

    expect(constructedQueueNames).toContain("cache-test-queue-a");
    expect(constructedQueueNames).toContain("cache-test-queue-b");
  });

  it("counts retained failures in the time window and leaves missing history unknown", async () => {
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now);
    try {
      const rows = await getQueueHealth();
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(row.failedLast24h).toBe(2);
        expect(row.lastCompletedAt).toBeNull();
        expect(row.oldestWaitingAt).toBeNull();
        expect(row.lastDurationMs).toBeNull();
        expect(zcount).toHaveBeenCalledWith(
          `bull:${row.queueName}:failed`,
          now - 86_400_000,
          now,
        );
      }
    } finally {
      vi.restoreAllMocks();
    }
  });
});
