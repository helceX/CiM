import { Queue, Worker } from "bullmq";
import {
  QUEUE_NAMES,
  type CrawlSchedulerJobData,
  type CrawlSourceJobData,
  type SendEmailJobData,
} from "@cim/core";
import { getRedisConnection } from "./redis";
import { processSendEmailJob } from "./jobs/send-email";
import { processCrawlSourceJob } from "./jobs/crawl-source";
import { processCrawlSchedulerJob } from "./jobs/crawl-scheduler";

/**
 * One BullMQ Worker per queue (docs/architecture/ARCHITECTURE.md — worker
 * is a separate deployable from apps/web, never sharing its process).
 * Additional queues (process_article, generate_digest, generate_report, …)
 * register here the same way as each pipeline stage ships.
 */
const connection = getRedisConnection();

const sendEmailWorker = new Worker<SendEmailJobData>(
  QUEUE_NAMES.sendEmail,
  processSendEmailJob,
  { connection, concurrency: 5 },
);

const crawlSourceQueue = new Queue<CrawlSourceJobData>(QUEUE_NAMES.crawlSource, { connection });
const crawlSourceWorker = new Worker<CrawlSourceJobData>(
  QUEUE_NAMES.crawlSource,
  processCrawlSourceJob,
  { connection, concurrency: 5 },
);

const crawlSchedulerWorker = new Worker<CrawlSchedulerJobData>(
  QUEUE_NAMES.crawlScheduler,
  () => processCrawlSchedulerJob(crawlSourceQueue),
  { connection, concurrency: 1 },
);
const crawlSchedulerQueue = new Queue<CrawlSchedulerJobData>(QUEUE_NAMES.crawlScheduler, {
  connection,
});

const allWorkers = [sendEmailWorker, crawlSourceWorker, crawlSchedulerWorker];
for (const worker of allWorkers) {
  worker.on("failed", (job, error) => {
    console.error(`[worker] job ${job?.id} (${worker.name}) failed:`, error);
  });
  worker.on("completed", (job) => {
    console.log(`[worker] job ${job.id} (${worker.name}) completed`);
  });
}

async function scheduleSourceCrawling() {
  // Every-30-seconds cadence is a dev-friendly default, not a fixed
  // architectural choice — per-source polling intervals (brief §35) are
  // Phase 3+ scope once source volume justifies differentiated cadence.
  // BullMQ 6's job-scheduler API (upsertJobScheduler) replaces the old
  // `repeat` option on Queue#add — see the v5→v6 migration guide.
  await crawlSchedulerQueue.upsertJobScheduler(
    "crawl-scheduler-repeat",
    { every: 30_000 },
    { name: QUEUE_NAMES.crawlScheduler, data: {} },
  );
  console.log("Source crawl scheduler registered (every 30s).");
}

console.log("Worker started. Listening for queued jobs…");
void scheduleSourceCrawling();

async function shutdown() {
  console.log("Worker shutting down…");
  await Promise.all(allWorkers.map((worker) => worker.close()));
  await crawlSourceQueue.close();
  await crawlSchedulerQueue.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
