import { Queue, Worker } from "bullmq";
import {
  QUEUE_NAMES,
  type AiEnrichJobData,
  type AlertSpikeCheckJobData,
  type CrawlSchedulerJobData,
  type CrawlSourceJobData,
  type InsightGenerateJobData,
  type SendEmailJobData,
} from "@cim/core";
import { getRedisConnection } from "./redis";
import { processSendEmailJob } from "./jobs/send-email";
import { processCrawlSourceJob } from "./jobs/crawl-source";
import { processCrawlSchedulerJob } from "./jobs/crawl-scheduler";
import { evaluateSpikeAlerts } from "./alerts/evaluate-spikes";
import { processAiEnrichJob } from "./ai/enrich";
import { processInsightGenerateJob } from "./ai/generate-insight";

/**
 * One BullMQ Worker per queue (docs/architecture/ARCHITECTURE.md — worker
 * is a separate deployable from apps/web, never sharing its process).
 * Additional queues (process_article, generate_digest, generate_report, …)
 * register here the same way as each pipeline stage ships.
 */
const connection = getRedisConnection();

const sendEmailQueue = new Queue<SendEmailJobData>(QUEUE_NAMES.sendEmail, { connection });
const sendEmailWorker = new Worker<SendEmailJobData>(
  QUEUE_NAMES.sendEmail,
  processSendEmailJob,
  { connection, concurrency: 5 },
);

const crawlSourceQueue = new Queue<CrawlSourceJobData>(QUEUE_NAMES.crawlSource, { connection });
const crawlSourceWorker = new Worker<CrawlSourceJobData>(
  QUEUE_NAMES.crawlSource,
  (job) => processCrawlSourceJob(job, sendEmailQueue),
  { connection, concurrency: 5 },
);

const crawlSchedulerQueue = new Queue<CrawlSchedulerJobData>(QUEUE_NAMES.crawlScheduler, {
  connection,
});
const crawlSchedulerWorker = new Worker<CrawlSchedulerJobData>(
  QUEUE_NAMES.crawlScheduler,
  () => processCrawlSchedulerJob(crawlSourceQueue),
  { connection, concurrency: 1 },
);

const alertSpikeCheckQueue = new Queue<AlertSpikeCheckJobData>(QUEUE_NAMES.alertSpikeCheck, {
  connection,
});
const alertSpikeCheckWorker = new Worker<AlertSpikeCheckJobData>(
  QUEUE_NAMES.alertSpikeCheck,
  () => evaluateSpikeAlerts(sendEmailQueue),
  { connection, concurrency: 1 },
);

const aiEnrichQueue = new Queue<AiEnrichJobData>(QUEUE_NAMES.aiEnrich, { connection });
const aiEnrichWorker = new Worker<AiEnrichJobData>(
  QUEUE_NAMES.aiEnrich,
  () => processAiEnrichJob(),
  { connection, concurrency: 1 },
);

const insightGenerateQueue = new Queue<InsightGenerateJobData>(QUEUE_NAMES.insightGenerate, {
  connection,
});
const insightGenerateWorker = new Worker<InsightGenerateJobData>(
  QUEUE_NAMES.insightGenerate,
  () => processInsightGenerateJob(),
  { connection, concurrency: 1 },
);

const allWorkers = [
  sendEmailWorker,
  crawlSourceWorker,
  crawlSchedulerWorker,
  alertSpikeCheckWorker,
  aiEnrichWorker,
  insightGenerateWorker,
];
for (const worker of allWorkers) {
  worker.on("failed", (job, error) => {
    console.error(`[worker] job ${job?.id} (${worker.name}) failed:`, error);
  });
  worker.on("completed", (job) => {
    console.log(`[worker] job ${job.id} (${worker.name}) completed`);
  });
}

async function scheduleRepeatingJobs() {
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
  await alertSpikeCheckQueue.upsertJobScheduler(
    "alert-spike-check-repeat",
    { every: 60_000 },
    { name: QUEUE_NAMES.alertSpikeCheck, data: {} },
  );
  // Dev-friendly cadence, same rationale as the crawl scheduler above —
  // a production deployment would enrich promptly after ingestion (~20s)
  // but generate the "since yesterday" insight far less often than every
  // 2 minutes; kept fast here so the pipeline is observable in dev/demo.
  await aiEnrichQueue.upsertJobScheduler(
    "ai-enrich-repeat",
    { every: 20_000 },
    { name: QUEUE_NAMES.aiEnrich, data: {} },
  );
  await insightGenerateQueue.upsertJobScheduler(
    "insight-generate-repeat",
    { every: 120_000 },
    { name: QUEUE_NAMES.insightGenerate, data: {} },
  );
  console.log(
    "Schedulers registered: source crawl (30s), spike alert check (60s), " +
      "AI enrichment (20s), insight generation (2m).",
  );
}

console.log("Worker started. Listening for queued jobs…");
void scheduleRepeatingJobs();

async function shutdown() {
  console.log("Worker shutting down…");
  await Promise.all(allWorkers.map((worker) => worker.close()));
  await sendEmailQueue.close();
  await crawlSourceQueue.close();
  await crawlSchedulerQueue.close();
  await alertSpikeCheckQueue.close();
  await aiEnrichQueue.close();
  await insightGenerateQueue.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
