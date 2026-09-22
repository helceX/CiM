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
 * "Full observability views" (per-job drill-down) is getFailedJobsForQueue
 * below (docs/product/FEATURE_MATRIX.md) — this is queue-level counts only.
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

export function isKnownQueueName(value: string): boolean {
  return (Object.values(QUEUE_NAMES) as string[]).includes(value);
}

export type FailedJobRow = {
  id: string;
  name: string;
  failedReason: string;
  attemptsMade: number;
  timestamp: number;
};

/**
 * The per-job drill-down docs/ux/SCREEN_INVENTORY.md §19 and this file's
 * own getQueueHealth comment point at — BullMQ already stores the failure
 * reason and attempt count on every failed job, this just surfaces it.
 * Caller must validate `queueName` against isKnownQueueName first
 * (apps/web/src/app/(admin)/admin/jobs/[queueName]/page.tsx) — this never
 * trusts a route param to be a real queue by itself.
 */
export async function getFailedJobsForQueue(
  queueName: string,
  limit = 50,
): Promise<FailedJobRow[]> {
  const connection = getRedis();
  const queue = new Queue(queueName, { connection });
  try {
    const jobs = await queue.getJobs(["failed"], 0, limit - 1, false);
    return jobs.map((job) => ({
      id: job.id ?? "",
      name: job.name,
      failedReason: job.failedReason ?? "Unknown error",
      attemptsMade: job.attemptsMade,
      timestamp: job.timestamp,
    }));
  } finally {
    await queue.close();
  }
}
