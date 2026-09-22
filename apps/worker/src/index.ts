import { Queue, Worker } from "bullmq";
import {
  QUEUE_NAMES,
  type AiEnrichJobData,
  type AlertCompetitorCheckJobData,
  type AlertEmergingTopicCheckJobData,
  type AlertSentimentShiftCheckJobData,
  type AlertSpikeCheckJobData,
  type CaptureFeatureUsageJobData,
  type CrawlSchedulerJobData,
  type CrawlSourceJobData,
  type EnforceRetentionJobData,
  type GenerateDigestJobData,
  type GenerateReportJobData,
  type GenerateScheduledReportsJobData,
  type InsightGenerateJobData,
  type SendEmailJobData,
} from "@cim/core";
import { getRedisConnection } from "./redis";
import { processSendEmailJob } from "./jobs/send-email";
import { processCrawlSourceJob } from "./jobs/crawl-source";
import { processCrawlSchedulerJob } from "./jobs/crawl-scheduler";
import { processGenerateReportJob } from "./jobs/generate-report";
import { processGenerateDigestJob } from "./jobs/generate-digest";
import { processGenerateScheduledReportsJob } from "./jobs/generate-scheduled-reports";
import { processEnforceRetentionJob } from "./jobs/enforce-retention";
import { processCaptureFeatureUsageJob } from "./jobs/capture-feature-usage";
import { evaluateSpikeAlerts } from "./alerts/evaluate-spikes";
import { evaluateSentimentShiftAlerts } from "./alerts/evaluate-sentiment-shift";
import { evaluateEmergingTopicAlerts } from "./alerts/evaluate-emerging-topics";
import { evaluateCompetitorAlerts } from "./alerts/evaluate-competitor";
import { processAiEnrichJob } from "./ai/enrich";
import { processInsightGenerateJob } from "./ai/generate-insight";

/**
 * One BullMQ Worker per queue (docs/architecture/ARCHITECTURE.md — worker
 * is a separate deployable from apps/web, never sharing its process).
 * Additional queues (process_article, generate_digest, generate_report, …)
 * register here the same way as each pipeline stage ships.
 */
const connection = getRedisConnection();

const sendEmailQueue = new Queue<SendEmailJobData>(QUEUE_NAMES.sendEmail, {
  connection,
});
const sendEmailWorker = new Worker<SendEmailJobData>(
  QUEUE_NAMES.sendEmail,
  processSendEmailJob,
  { connection, concurrency: 5 },
);

const crawlSourceQueue = new Queue<CrawlSourceJobData>(QUEUE_NAMES.crawlSource, {
  connection,
});
const crawlSourceWorker = new Worker<CrawlSourceJobData>(
  QUEUE_NAMES.crawlSource,
  (job) => processCrawlSourceJob(job, sendEmailQueue),
  { connection, concurrency: 5 },
);

const crawlSchedulerQueue = new Queue<CrawlSchedulerJobData>(
  QUEUE_NAMES.crawlScheduler,
  {
    connection,
  },
);
const crawlSchedulerWorker = new Worker<CrawlSchedulerJobData>(
  QUEUE_NAMES.crawlScheduler,
  () => processCrawlSchedulerJob(crawlSourceQueue),
  { connection, concurrency: 1 },
);

const alertSpikeCheckQueue = new Queue<AlertSpikeCheckJobData>(
  QUEUE_NAMES.alertSpikeCheck,
  {
    connection,
  },
);
const alertSpikeCheckWorker = new Worker<AlertSpikeCheckJobData>(
  QUEUE_NAMES.alertSpikeCheck,
  () => evaluateSpikeAlerts(sendEmailQueue),
  { connection, concurrency: 1 },
);

const alertSentimentShiftCheckQueue = new Queue<AlertSentimentShiftCheckJobData>(
  QUEUE_NAMES.alertSentimentShiftCheck,
  { connection },
);
const alertSentimentShiftCheckWorker = new Worker<AlertSentimentShiftCheckJobData>(
  QUEUE_NAMES.alertSentimentShiftCheck,
  () => evaluateSentimentShiftAlerts(sendEmailQueue),
  { connection, concurrency: 1 },
);

const alertEmergingTopicCheckQueue = new Queue<AlertEmergingTopicCheckJobData>(
  QUEUE_NAMES.alertEmergingTopicCheck,
  { connection },
);
const alertEmergingTopicCheckWorker = new Worker<AlertEmergingTopicCheckJobData>(
  QUEUE_NAMES.alertEmergingTopicCheck,
  () => evaluateEmergingTopicAlerts(sendEmailQueue),
  { connection, concurrency: 1 },
);

const alertCompetitorCheckQueue = new Queue<AlertCompetitorCheckJobData>(
  QUEUE_NAMES.alertCompetitorCheck,
  { connection },
);
const alertCompetitorCheckWorker = new Worker<AlertCompetitorCheckJobData>(
  QUEUE_NAMES.alertCompetitorCheck,
  () => evaluateCompetitorAlerts(sendEmailQueue),
  { connection, concurrency: 1 },
);

const aiEnrichQueue = new Queue<AiEnrichJobData>(QUEUE_NAMES.aiEnrich, { connection });
const aiEnrichWorker = new Worker<AiEnrichJobData>(
  QUEUE_NAMES.aiEnrich,
  () => processAiEnrichJob(),
  { connection, concurrency: 1 },
);

const insightGenerateQueue = new Queue<InsightGenerateJobData>(
  QUEUE_NAMES.insightGenerate,
  {
    connection,
  },
);
const insightGenerateWorker = new Worker<InsightGenerateJobData>(
  QUEUE_NAMES.insightGenerate,
  () => processInsightGenerateJob(),
  { connection, concurrency: 1 },
);

const generateReportQueue = new Queue<GenerateReportJobData>(
  QUEUE_NAMES.generateReport,
  {
    connection,
  },
);
const generateReportWorker = new Worker<GenerateReportJobData>(
  QUEUE_NAMES.generateReport,
  (job) => processGenerateReportJob(job),
  // Headless-Chromium PDF renders are heavier than the other jobs — cap
  // concurrency so a burst of "Generate report" clicks doesn't spike
  // worker memory.
  { connection, concurrency: 2 },
);

const generateDigestQueue = new Queue<GenerateDigestJobData>(
  QUEUE_NAMES.generateDigest,
  { connection },
);
const generateDigestWorker = new Worker<GenerateDigestJobData>(
  QUEUE_NAMES.generateDigest,
  () => processGenerateDigestJob(sendEmailQueue),
  { connection, concurrency: 1 },
);

const generateScheduledReportsQueue = new Queue<GenerateScheduledReportsJobData>(
  QUEUE_NAMES.generateScheduledReports,
  { connection },
);
const generateScheduledReportsWorker = new Worker<GenerateScheduledReportsJobData>(
  QUEUE_NAMES.generateScheduledReports,
  () => processGenerateScheduledReportsJob(generateReportQueue),
  { connection, concurrency: 1 },
);

const enforceRetentionQueue = new Queue<EnforceRetentionJobData>(
  QUEUE_NAMES.enforceRetention,
  { connection },
);
const enforceRetentionWorker = new Worker<EnforceRetentionJobData>(
  QUEUE_NAMES.enforceRetention,
  () => processEnforceRetentionJob(),
  { connection, concurrency: 1 },
);

const captureFeatureUsageQueue = new Queue<CaptureFeatureUsageJobData>(
  QUEUE_NAMES.captureFeatureUsage,
  { connection },
);
const captureFeatureUsageWorker = new Worker<CaptureFeatureUsageJobData>(
  QUEUE_NAMES.captureFeatureUsage,
  () => processCaptureFeatureUsageJob(),
  { connection, concurrency: 1 },
);

const allWorkers = [
  sendEmailWorker,
  crawlSourceWorker,
  crawlSchedulerWorker,
  alertSpikeCheckWorker,
  alertSentimentShiftCheckWorker,
  alertEmergingTopicCheckWorker,
  alertCompetitorCheckWorker,
  aiEnrichWorker,
  insightGenerateWorker,
  generateReportWorker,
  generateDigestWorker,
  generateScheduledReportsWorker,
  enforceRetentionWorker,
  captureFeatureUsageWorker,
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
  await alertSentimentShiftCheckQueue.upsertJobScheduler(
    "alert-sentiment-shift-check-repeat",
    { every: 60_000 },
    { name: QUEUE_NAMES.alertSentimentShiftCheck, data: {} },
  );
  await alertEmergingTopicCheckQueue.upsertJobScheduler(
    "alert-emerging-topic-check-repeat",
    { every: 60_000 },
    { name: QUEUE_NAMES.alertEmergingTopicCheck, data: {} },
  );
  await alertCompetitorCheckQueue.upsertJobScheduler(
    "alert-competitor-check-repeat",
    { every: 60_000 },
    { name: QUEUE_NAMES.alertCompetitorCheck, data: {} },
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
  // Unlike the dev-friendly intervals above, the digest is genuinely a
  // once-a-day product feature (docs/product/FEATURE_MATRIX.md "Email
  // daily digest") — a cron pattern, not a fast polling interval, so its
  // cadence is correct in every environment, not just demo-fast in dev.
  await generateDigestQueue.upsertJobScheduler(
    "generate-digest-repeat",
    { pattern: "0 8 * * *" },
    { name: QUEUE_NAMES.generateDigest, data: {} },
  );
  // Same once-a-day cron shape as the digest, offset 15 minutes so the
  // two don't contend — finest schedule granularity is weekly, so a
  // daily due-check is plenty (docs/product/FEATURE_MATRIX.md "Weekly/
  // monthly/yearly scheduled reports").
  await generateScheduledReportsQueue.upsertJobScheduler(
    "generate-scheduled-reports-repeat",
    { pattern: "15 8 * * *" },
    { name: QUEUE_NAMES.generateScheduledReports, data: {} },
  );
  // Same once-a-day cron shape, offset another 15 minutes so the three
  // daily cross-tenant passes don't contend (docs/architecture/SECURITY.md
  // "DataRetentionPolicy ... drives a cleanup job — not a manual process").
  await enforceRetentionQueue.upsertJobScheduler(
    "enforce-retention-repeat",
    { pattern: "30 8 * * *" },
    { name: QUEUE_NAMES.enforceRetention, data: {} },
  );
  // Same once-a-day cron shape, offset another 15 minutes so the four
  // daily cross-tenant passes don't contend (docs/architecture/
  // DATA_MODEL.md "Subscription / FeatureUsage ... populated from day
  // one even though billing enforcement is a later phase").
  await captureFeatureUsageQueue.upsertJobScheduler(
    "capture-feature-usage-repeat",
    { pattern: "45 8 * * *" },
    { name: QUEUE_NAMES.captureFeatureUsage, data: {} },
  );
  console.log(
    "Schedulers registered: source crawl (30s), spike alert check (60s), " +
      "sentiment shift alert check (60s), emerging topic alert check (60s), " +
      "AI enrichment (20s), insight generation (2m), " +
      "daily digest (08:00 UTC), scheduled reports (08:15 UTC), retention enforcement (08:30 UTC), " +
      "feature usage capture (08:45 UTC).",
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
  await alertSentimentShiftCheckQueue.close();
  await alertEmergingTopicCheckQueue.close();
  await alertCompetitorCheckQueue.close();
  await aiEnrichQueue.close();
  await insightGenerateQueue.close();
  await generateReportQueue.close();
  await generateDigestQueue.close();
  await generateScheduledReportsQueue.close();
  await enforceRetentionQueue.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
