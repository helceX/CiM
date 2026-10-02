import type { Job, Queue } from "bullmq";
import { eq } from "drizzle-orm";
import { ingestSource } from "@cim/ingestion";
import { isSourceDue, type CrawlSourceJobData, type SendEmailJobData } from "@cim/core";
import { db, markSourceChecked, schema } from "@cim/db";
import { getConnectorFor } from "../connector-registry";
import { evaluateNewMentionAlerts } from "../alerts/evaluate";

/**
 * One job per Source (docs/architecture/INGESTION.md) — a failure here
 * (thrown, triggering BullMQ retry/backoff) never blocks any other
 * source's job; each is independent (brief §135, §93).
 */
export async function processCrawlSourceJob(
  job: Job<CrawlSourceJobData>,
  emailQueue: Queue<SendEmailJobData>,
): Promise<void> {
  const [source] = await db
    .select()
    .from(schema.sources)
    .where(eq(schema.sources.id, job.data.sourceId));
  if (!source) {
    throw new Error(`Source not found: ${job.data.sourceId}`);
  }

  // A job that waited in the queue while the source was crawled by another one
  // (or an older backlog) must not fetch the publisher again. Only a first attempt
  // is skipped: a retry runs because the previous attempt failed and recorded its
  // check, so it is "not due" by design.
  if (job.attemptsMade === 0 && !isSourceDue(source)) return;

  const connector = getConnectorFor(source.connector);
  if (!connector) {
    await markSourceChecked(db, source.id, "unavailable");
    console.warn(`[worker] no connector implemented for "${source.connector}", skipping`);
    return;
  }

  const health = await connector.healthCheck(source);
  if (health.status !== "healthy") {
    await markSourceChecked(db, source.id, health.status);
    return;
  }

  let result;
  try {
    result = await ingestSource(db, source, connector);
  } catch (error) {
    // Record the attempt so the failure counts as a check: without this
    // lastCheckedAt stays old and the source would be re-fetched on every
    // scheduler tick instead of waiting out its crawl interval.
    await markSourceChecked(db, source.id, "error");
    throw error;
  }
  await markSourceChecked(db, source.id, "healthy");
  console.log(
    `[worker] crawled source "${source.name}": ${result.itemsFetched} item(s), ` +
      `${result.articlesCreated} new article(s), ${result.mentionsCreated} new mention(s)`,
  );

  if (result.newMentions.length > 0) {
    await evaluateNewMentionAlerts(emailQueue, result.newMentions);
  }
}
