import "server-only";
import { Queue } from "bullmq";
import { QUEUE_NAMES } from "@cim/core";
import { getRedis } from "./redis";

export type QueueHealthRow = {
  queueName: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
};

const JOB_COUNT_TYPES = ["waiting", "active", "completed", "failed", "delayed"] as const;

/**
 * Read-only introspection (no Worker, nothing consumed) — BullMQ already
 * tracks these counts in Redis for every queue apps/worker registers
 * (docs/ux/SCREEN_INVENTORY.md §19 "job queue health, failed jobs").
 * "Full observability views" (per-job drill-down) is P2
 * (docs/product/FEATURE_MATRIX.md) — this is queue-level counts only.
 */
export async function getQueueHealth(): Promise<QueueHealthRow[]> {
  const connection = getRedis();
  const queueNames = Object.values(QUEUE_NAMES);

  return Promise.all(
    queueNames.map(async (queueName) => {
      const queue = new Queue(queueName, { connection });
      try {
        const counts = await queue.getJobCounts(...JOB_COUNT_TYPES);
        return {
          queueName,
          waiting: counts.waiting ?? 0,
          active: counts.active ?? 0,
          completed: counts.completed ?? 0,
          failed: counts.failed ?? 0,
          delayed: counts.delayed ?? 0,
        };
      } finally {
        await queue.close();
      }
    }),
  );
}
