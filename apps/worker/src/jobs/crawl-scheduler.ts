import type { Queue } from "bullmq";
import { QUEUE_NAMES, type CrawlSourceJobData } from "@cim/core";
import { db, listActiveSources } from "@cim/db";

/**
 * Fans out one `crawl_source` job per active, healthy Source. A
 * deterministic jobId per source+tick means a scheduler tick that fires
 * while the previous one's jobs are still queued/active doesn't pile up
 * duplicate work for the same source (BullMQ dedupes by jobId).
 */
export async function processCrawlSchedulerJob(crawlSourceQueue: Queue<CrawlSourceJobData>): Promise<void> {
  const sources = await listActiveSources(db);
  const tickBucket = Math.floor(Date.now() / 30_000);

  await Promise.all(
    sources.map((source) =>
      crawlSourceQueue.add(
        QUEUE_NAMES.crawlSource,
        { sourceId: source.id },
        {
          jobId: `${source.id}-${tickBucket}`,
          attempts: 3,
          backoff: { type: "exponential", delay: 5_000 },
        },
      ),
    ),
  );
}
