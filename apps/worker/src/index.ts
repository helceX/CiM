import { Worker } from "bullmq";
import { QUEUE_NAMES, type SendEmailJobData } from "@cim/core";
import { getRedisConnection } from "./redis";
import { processSendEmailJob } from "./jobs/send-email";

/**
 * One BullMQ Worker per queue (docs/architecture/ARCHITECTURE.md — worker
 * is a separate deployable from apps/web, never sharing its process).
 * Additional queues (crawl_source, process_article, generate_digest, …)
 * register here the same way as each pipeline stage ships.
 */
const sendEmailWorker = new Worker<SendEmailJobData>(
  QUEUE_NAMES.sendEmail,
  processSendEmailJob,
  { connection: getRedisConnection(), concurrency: 5 },
);

sendEmailWorker.on("failed", (job, error) => {
  console.error(`[worker] job ${job?.id} (${QUEUE_NAMES.sendEmail}) failed:`, error);
});

sendEmailWorker.on("completed", (job) => {
  console.log(`[worker] job ${job.id} (${QUEUE_NAMES.sendEmail}) completed`);
});

console.log("Worker started. Listening for queued jobs…");

async function shutdown() {
  console.log("Worker shutting down…");
  await sendEmailWorker.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
