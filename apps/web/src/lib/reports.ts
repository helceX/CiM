import "server-only";
import { Queue } from "bullmq";
import { QUEUE_NAMES, type GenerateReportJobData } from "@cim/core";
import { getRedis } from "./redis";

let generateReportQueue: Queue<GenerateReportJobData> | undefined;

function getGenerateReportQueue(): Queue<GenerateReportJobData> {
  if (!generateReportQueue) {
    generateReportQueue = new Queue<GenerateReportJobData>(QUEUE_NAMES.generateReport, {
      connection: getRedis(),
    });
  }
  return generateReportQueue;
}

/** brief §34/§91/§128 — report generation (headless-Chromium PDF render) is always queued work, never inline in a request. */
export async function enqueueReportGeneration(reportRunId: string): Promise<void> {
  await getGenerateReportQueue().add(
    QUEUE_NAMES.generateReport,
    { reportRunId },
    { attempts: 2, backoff: { type: "exponential", delay: 5000 } },
  );
}
