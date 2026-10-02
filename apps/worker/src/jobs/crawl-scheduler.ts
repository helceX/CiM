import type { Queue } from "bullmq";
import { QUEUE_NAMES, isSourceDue, type CrawlSourceJobData } from "@cim/core";
import { db, listActiveSources } from "@cim/db";

/** States in which a crawl job for a source is still on its way (or running) — don't queue another. */
const PENDING_STATES = new Set(["waiting", "active", "delayed", "prioritized", "waiting-children"]);

/**
 * Fans out one `crawl_source` job per active Source that is DUE (see
 * crawl-interval.ts — the tick is every 30 s, a real site is fetched every
 * two hours at most).
 *
 * A source stays "due" until its job finishes and records the check, so when
 * the queue is busier than the tick (hundreds of sources, a few workers) the
 * same source used to be queued again on every tick — a per-tick jobId did not
 * stop that — and the backlog grew without bound, each stale job fetching the
 * publisher again. There is now exactly one job id per source: while that job
 * is waiting, running or delayed for a retry, the source is skipped; once it has
 * finished (completed or failed), its record is removed so the next due run can
 * reuse the id.
 */
export async function processCrawlSchedulerJob(crawlSourceQueue: Queue<CrawlSourceJobData>): Promise<void> {
  const now = new Date();
  const sources = (await listActiveSources(db)).filter((source) => isSourceDue(source, now));

  // Isolated per source (the established fan-out pattern, generate-insight.ts)
  // — Promise.all would abort the whole tick on the first queue.add()
  // rejection, leaving every source ordered after it unenqueued for this
  // tick even though most sources' adds would have succeeded.
  await Promise.all(
    sources.map(async (source) => {
      try {
        const jobId = `crawl-${source.id}`;
        const existing = await crawlSourceQueue.getJob(jobId);
        if (existing) {
          if (PENDING_STATES.has(await existing.getState())) return;
          await existing.remove();
        }
        await crawlSourceQueue.add(
          QUEUE_NAMES.crawlSource,
          { sourceId: source.id },
          {
            jobId,
            attempts: 3,
            backoff: { type: "exponential", delay: 5_000 },
          },
        );
      } catch (error) {
        console.error(`[worker] crawl_scheduler failed to enqueue source ${source.id}:`, error);
      }
    }),
  );
}
