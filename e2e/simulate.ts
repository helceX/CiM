import { eq } from "drizzle-orm";
import type { Job, Queue } from "bullmq";
import type { GenerateReportJobData, SendEmailJobData } from "@cim/core";
import { db, schema } from "@cim/db";
import { ingestSource, MockNewsConnector, type IngestSourceResult } from "@cim/ingestion";
import { evaluateNewMentionAlerts } from "../apps/worker/src/alerts/evaluate";
import { processGenerateReportJob } from "../apps/worker/src/jobs/generate-report";

/**
 * Several worker stages (ingestion crawl ticks, report rendering) run on
 * their own schedule or queue, seconds to minutes away from a UI action
 * — a real E2E test waiting on that timing would be either slow or
 * flaky. These call the exact same functions the worker calls
 * (apps/worker/src/jobs/crawl-source.ts's own sequence: ingest, then
 * evaluate alerts against whatever it produced), just synchronously and
 * on demand, so "save a query, see it match" and "create an alert rule,
 * see it fire" stay deterministic without a live worker process during
 * the test run. The email side-effect is faked — this app's in-app
 * notification, the thing these E2E tests actually assert on, is real.
 */
const fakeEmailQueue = { add: async () => undefined } as unknown as Queue<SendEmailJobData>;

/**
 * Runs one real ingestion pass over a seeded source (fetch → normalize →
 * dedupe → query match) followed by real alert evaluation, exactly like
 * the worker's crawl_source job — new Articles/Mentions/AlertEvents/
 * Notifications land for real, matched against whatever
 * MonitoringQueries/AlertRules are active right now.
 */
export async function simulateCrawl(sourceName: string): Promise<IngestSourceResult> {
  const [source] = await db.select().from(schema.sources).where(eq(schema.sources.name, sourceName));
  if (!source) throw new Error(`e2e fixture source not found: ${sourceName}`);
  const result = await ingestSource(db, source, new MockNewsConnector());
  if (result.newMentions.length > 0) {
    await evaluateNewMentionAlerts(fakeEmailQueue, result.newMentions);
  }
  return result;
}

/**
 * Renders a queued report run for real (real PDF via headless Chromium,
 * real CSV) — exactly apps/worker/src/jobs/generate-report.ts's own job
 * handler, called directly instead of waiting on a live worker to pick
 * the job up off the queue.
 */
export async function simulateReportGeneration(reportRunId: string): Promise<void> {
  const fakeJob = { data: { reportRunId } } as Job<GenerateReportJobData>;
  await processGenerateReportJob(fakeJob);
}
