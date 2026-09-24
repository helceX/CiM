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

// One Queue per name, reused for the process lifetime — same singleton
// pattern as getSendEmailQueue in ./email.ts. Constructing a new BullMQ
// Queue per request (and closing it right after) re-does client setup on
// every admin page load; a plain Queue never needs closing between calls.
const queueCache = new Map<string, Queue>();

function getCachedQueue(queueName: string): Queue {
  let queue = queueCache.get(queueName);
  if (!queue) {
    queue = new Queue(queueName, { connection: getRedis() });
    queueCache.set(queueName, queue);
  }
  return queue;
}

/**
 * Read-only introspection (no Worker, nothing consumed) — BullMQ already
 * tracks these counts in Redis for every queue apps/worker registers
 * (docs/ux/SCREEN_INVENTORY.md §19 "job queue health, failed jobs").
 * "Full observability views" (per-job drill-down) is getFailedJobsForQueue
 * below (docs/product/FEATURE_MATRIX.md) — this is queue-level counts only.
 */
export async function getQueueHealth(): Promise<QueueHealthRow[]> {
  const queueNames = Object.values(QUEUE_NAMES);

  return Promise.all(
    queueNames.map(async (queueName) => {
      const queue = getCachedQueue(queueName);
      const counts = await queue.getJobCounts(...JOB_COUNT_TYPES);
      return {
        queueName,
        waiting: counts.waiting ?? 0,
        active: counts.active ?? 0,
        completed: counts.completed ?? 0,
        failed: counts.failed ?? 0,
        delayed: counts.delayed ?? 0,
      };
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
  failedAt: number;
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
  const queue = getCachedQueue(queueName);
  const jobs = await queue.getJobs(["failed"], 0, limit - 1, false);
  return jobs.map((job) => ({
    id: job.id ?? "",
    name: job.name,
    failedReason: job.failedReason ?? "Unknown error",
    attemptsMade: job.attemptsMade,
    // job.timestamp is when the job was *created* — for a job retried
    // several times before finally failing, that's not when it failed.
    // finishedOn is set once the job settles (BullMQ's Job class); a
    // still-active job never reaches this list (queue.getJobs(["failed"])),
    // so it's always populated here.
    failedAt: job.finishedOn ?? job.timestamp,
  }));
}
