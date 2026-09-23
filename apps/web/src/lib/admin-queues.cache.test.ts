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
      .mockResolvedValue({ waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 });
    getJobs = vi.fn().mockResolvedValue([]);
    close = vi.fn().mockResolvedValue(undefined);
    constructor(name: string) {
      this.name = name;
      constructedQueueNames.push(name);
    }
  }
  return { Queue: MockQueue };
});

vi.mock("./redis", () => ({ getRedis: () => ({}) }));

import { getFailedJobsForQueue } from "./admin-queues";

describe("admin-queues Queue caching", () => {
  beforeEach(() => {
    constructedQueueNames.length = 0;
  });

  it("constructs a Queue for a given name only once, reusing it on later calls", async () => {
    await getFailedJobsForQueue("cache-test-queue");
    await getFailedJobsForQueue("cache-test-queue");
    await getFailedJobsForQueue("cache-test-queue");

    expect(constructedQueueNames.filter((name) => name === "cache-test-queue")).toHaveLength(1);
  });

  it("still constructs separate Queues for distinct queue names", async () => {
    await getFailedJobsForQueue("cache-test-queue-a");
    await getFailedJobsForQueue("cache-test-queue-b");

    expect(constructedQueueNames).toContain("cache-test-queue-a");
    expect(constructedQueueNames).toContain("cache-test-queue-b");
  });
});
