import { describe, expect, it } from "vitest";
import Redis from "ioredis";
import { Queue, Worker } from "bullmq";
import { getEnv } from "@cim/config";
import { getRedis } from "./redis";
import { getFailedJobsForQueue, getQueuedJobsForQueue, isKnownQueueName } from "./admin-queues";

/**
 * docs/product/FEATURE_MATRIX.md P2 "Full observability views" — real
 * Redis (docs/testing/TEST_STRATEGY.md integration tier), a real BullMQ
 * Worker that actually throws, not a mocked job record.
 */
describe("getFailedJobsForQueue (integration)", () => {
  it("returns a real failed job's reason and attempt count", async () => {
    const queueName = `admin-queues-test-${crypto.randomUUID()}`;
    const queue = new Queue(queueName, { connection: getRedis() });
    // A Worker needs its own connection with maxRetriesPerRequest: null
    // for BullMQ's blocking commands (apps/worker/src/redis.ts) — getRedis()
    // above is the shared apps/web client (rate-limiting etc.), which
    // isn't configured that way.
    const workerConnection = new Redis(getEnv().REDIS_URL, {
      maxRetriesPerRequest: null,
    });
    const worker = new Worker(
      queueName,
      async () => {
        throw new Error("boom - deliberate test failure");
      },
      { connection: workerConnection, concurrency: 1 },
    );

    try {
      // A delay between the job being created and actually processed —
      // regression coverage for failedAt being job.timestamp (creation)
      // instead of job.finishedOn (when it actually failed): without a
      // gap between the two, a fast synchronous test can't tell them
      // apart, since they'd be only milliseconds different either way.
      const delayMs = 1500;
      const createdAt = Date.now();
      const job = await queue.add("test-job", {}, { attempts: 1, delay: delayMs });
      await new Promise<void>((resolve, reject) => {
        worker.on("failed", (failedJob) => {
          if (failedJob?.id === job.id) resolve();
        });
        setTimeout(
          () => reject(new Error("timed out waiting for the job to fail")),
          10000,
        );
      });

      const rows = await getFailedJobsForQueue(queueName);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.name).toBe("test-job");
      expect(rows[0]?.failedReason).toContain("boom - deliberate test failure");
      expect(rows[0]?.attemptsMade).toBe(1);
      // failedAt must reflect when it actually failed (after the delay),
      // not job.timestamp (createdAt, before the delay).
      expect(rows[0]?.failedAt).toBeGreaterThanOrEqual(createdAt + delayMs);
    } finally {
      await worker.close();
      await workerConnection.quit();
      await queue.obliterate({ force: true });
      await queue.close();
    }
  }, 15000);

  it("returns an empty list for a queue with no failed jobs", async () => {
    const queueName = `admin-queues-test-empty-${crypto.randomUUID()}`;
    const rows = await getFailedJobsForQueue(queueName);
    expect(rows).toEqual([]);
  });

  it("returns an empty list for limit=0, never every failed job in the queue", async () => {
    // Regression: BullMQ's getJobs end index follows Redis ZRANGE
    // conventions, where -1 means "through the last element" — passing
    // limit - 1 as end without guarding limit <= 0 turned limit=0 into
    // end=-1 and returned the entire failed-jobs list instead of none.
    const queueName = `admin-queues-test-zero-limit-${crypto.randomUUID()}`;
    const queue = new Queue(queueName, { connection: getRedis() });
    const workerConnection = new Redis(getEnv().REDIS_URL, {
      maxRetriesPerRequest: null,
    });
    const worker = new Worker(
      queueName,
      async () => {
        throw new Error("boom - deliberate test failure");
      },
      { connection: workerConnection, concurrency: 1 },
    );

    try {
      const job = await queue.add("test-job", {}, { attempts: 1 });
      await new Promise<void>((resolve, reject) => {
        worker.on("failed", (failedJob) => {
          if (failedJob?.id === job.id) resolve();
        });
        setTimeout(
          () => reject(new Error("timed out waiting for the job to fail")),
          10000,
        );
      });

      const rows = await getFailedJobsForQueue(queueName, 0);
      expect(rows).toEqual([]);
    } finally {
      await worker.close();
      await workerConnection.quit();
      await queue.obliterate({ force: true });
      await queue.close();
    }
  }, 15000);
});

describe("isKnownQueueName", () => {
  it("accepts a real registered queue name and rejects an arbitrary string", () => {
    expect(isKnownQueueName("send_email")).toBe(true);
    expect(isKnownQueueName("not-a-real-queue")).toBe(false);
  });
});

describe("getQueuedJobsForQueue (integration)", () => {
  it("lists waiting jobs with their source id, oldest first, and honours the limit", async () => {
    const queueName = `admin-queues-test-waiting-${crypto.randomUUID()}`;
    const queue = new Queue(queueName, { connection: getRedis() });
    try {
      await queue.add("crawl_source", { sourceId: "source-1" });
      await queue.add("crawl_source", { sourceId: "source-2" });
      await queue.add("crawl_source", { sourceId: "source-3" });

      const rows = await getQueuedJobsForQueue(queueName, "waiting", 2);
      expect(rows.map((row) => row.sourceId)).toEqual(["source-1", "source-2"]);
      expect(rows[0]?.data).toContain("source-1");
      expect(await getQueuedJobsForQueue(queueName, "active", 10)).toEqual([]);
      expect(await getQueuedJobsForQueue(queueName, "waiting", 0)).toEqual([]);
    } finally {
      await queue.obliterate({ force: true });
      await queue.close();
    }
  });
});
