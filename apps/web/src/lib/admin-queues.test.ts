import { describe, expect, it } from "vitest";
import Redis from "ioredis";
import { Queue, Worker } from "bullmq";
import { getEnv } from "@cim/config";
import { getRedis } from "./redis";
import { getFailedJobsForQueue, isKnownQueueName } from "./admin-queues";

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
    const workerConnection = new Redis(getEnv().REDIS_URL, { maxRetriesPerRequest: null });
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
        setTimeout(() => reject(new Error("timed out waiting for the job to fail")), 10000);
      });

      const rows = await getFailedJobsForQueue(queueName);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.name).toBe("test-job");
      expect(rows[0]?.failedReason).toContain("boom - deliberate test failure");
      expect(rows[0]?.attemptsMade).toBe(1);
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
});

describe("isKnownQueueName", () => {
  it("accepts a real registered queue name and rejects an arbitrary string", () => {
    expect(isKnownQueueName("send_email")).toBe(true);
    expect(isKnownQueueName("not-a-real-queue")).toBe(false);
  });
});
