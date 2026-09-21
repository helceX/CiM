import type { Job } from "bullmq";
import { eq } from "drizzle-orm";
import { ingestSource } from "@cim/ingestion";
import type { CrawlSourceJobData } from "@cim/core";
import { db, markSourceChecked, schema } from "@cim/db";
import { getConnectorFor } from "../connector-registry";

/**
 * One job per Source (docs/architecture/INGESTION.md) — a failure here
 * (thrown, triggering BullMQ retry/backoff) never blocks any other
 * source's job; each is independent (brief §135, §93).
 */
export async function processCrawlSourceJob(job: Job<CrawlSourceJobData>): Promise<void> {
  const [source] = await db
    .select()
    .from(schema.sources)
    .where(eq(schema.sources.id, job.data.sourceId));
  if (!source) {
    throw new Error(`Source not found: ${job.data.sourceId}`);
  }

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

  const result = await ingestSource(db, source, connector);
  await markSourceChecked(db, source.id, "healthy");
  console.log(
    `[worker] crawled source "${source.name}": ${result.itemsFetched} item(s), ` +
      `${result.articlesCreated} new article(s), ${result.mentionsCreated} new mention(s)`,
  );
}
