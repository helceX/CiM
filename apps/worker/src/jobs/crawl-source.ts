import type { Job, Queue } from "bullmq";
import { eq } from "drizzle-orm";
import { crawlSignature, ingestSource } from "@cim/ingestion";
import { crawlBackoffMs, crawlIntervalMs, isSourceDue, type CrawlSourceJobData, type SendEmailJobData } from "@cim/core";
import { db, markSourceChecked, schema, type ActiveMonitoringQuery } from "@cim/db";
import { getConnectorFor } from "../connector-registry";
import type { SourceConnector } from "@cim/ingestion";
import { evaluateNewMentionAlerts } from "../alerts/evaluate";
import { getActiveQueries } from "../active-queries-cache";
import { FULL_PASS_MS, redisCrawlStateStore, redisCrawlStats, type CrawlStateStore, type CrawlStatsSink } from "../crawl-state";
import { getRedisConnection } from "../redis";

export type CrawlDeps = {
  connectorFor?: (connector: string) => SourceConnector | undefined;
  /** What a crawl remembers between crawls (Redis in production). */
  state?: CrawlStateStore;
  stats?: CrawlStatsSink;
  activeQueries?: (sourceType: string) => Promise<ActiveMonitoringQuery[]>;
  now?: () => number;
};

let defaults: { state: CrawlStateStore; stats: CrawlStatsSink } | undefined;
function productionDefaults() {
  defaults ??= { state: redisCrawlStateStore(getRedisConnection()), stats: redisCrawlStats(getRedisConnection()) };
  return defaults;
}

/**
 * One job per Source (docs/architecture/INGESTION.md) — a failure here
 * (thrown, triggering BullMQ retry/backoff) never blocks any other
 * source's job; each is independent (brief §135, §93).
 *
 * The cost of a crawl is mostly what it does when nothing happened, which is most of the time. So a crawl remembers
 * (crawl-state.ts) the publisher's version of the feed, which stories it already handled and how many times in a row
 * the source failed:
 *  - the feed is requested with If-None-Match / If-Modified-Since, and a 304 ends the crawl there;
 *  - stories already handled under the same monitorings are not looked up or matched again;
 *  - a source that keeps failing is left alone for longer (4 h, 8 h, 16 h, 24 h) and a Retry-After is honoured.
 * Nothing is remembered about a crawl that did not finish, the monitorings' signature is part of what is remembered
 * (a new or edited monitoring sees the whole feed again) and a full pass is made at least daily, so a lost or stale
 * memory only costs a full crawl — what every crawl used to be.
 */
export async function processCrawlSourceJob(
  job: Job<CrawlSourceJobData>,
  emailQueue: Queue<SendEmailJobData>,
  deps: CrawlDeps = {},
): Promise<void> {
  const [source] = await db
    .select()
    .from(schema.sources)
    .where(eq(schema.sources.id, job.data.sourceId));
  if (!source) {
    throw new Error(`Source not found: ${job.data.sourceId}`);
  }

  // Jobs may already be waiting in Redis when an administrator pauses a
  // source (for example after a publisher opt-out). Re-check the current
  // state in the worker so a queued or retried job cannot contact it again.
  if (source.status === "unavailable") return;

  // A job that waited in the queue while the source was crawled by another one
  // (or an older backlog) must not fetch the publisher again. Only a first attempt
  // is skipped: a retry runs because the previous attempt failed and recorded its
  // check, so it is "not due" by design.
  if (job.attemptsMade === 0 && !isSourceDue(source)) return;

  const connector = (deps.connectorFor ?? getConnectorFor)(source.connector);
  if (!connector) {
    await markSourceChecked(db, source.id, "unavailable");
    console.warn(`[worker] no connector implemented for "${source.connector}", skipping`);
    return;
  }

  const store = deps.state ?? productionDefaults().state;
  const stats = deps.stats ?? productionDefaults().stats;
  const now = (deps.now ?? Date.now)();
  const state = await store.get(source.id);

  // Earlier failures asked for a longer wait. Recording the check keeps the scheduler from queueing the source again
  // before its normal interval has passed; the publisher is not contacted.
  if (job.attemptsMade === 0 && state?.nextAt && now < state.nextAt) {
    await markSourceChecked(db, source.id, source.status as Parameters<typeof markSourceChecked>[2]);
    await stats({ backoff_skips: 1 });
    return;
  }

  const queries = await (deps.activeQueries ?? getActiveQueries)(source.type);
  const sig = crawlSignature(source, queries);
  // The memory of the last crawl is only used while it was recorded under the same monitorings and is under a day old.
  const reusable = state !== null && state.sig === sig && now - state.fullAt < FULL_PASS_MS ? state : null;

  const health = await connector.healthCheck(source, reusable ? { validators: reusable.validators } : undefined);
  if (health.status !== "healthy") {
    const failures = (state?.failures ?? 0) + 1;
    const wait = crawlBackoffMs(failures, crawlIntervalMs(source.connector), health.retryAfterMs);
    await store.set(source.id, { sig: state?.sig ?? sig, seen: state?.seen ?? [], validators: state?.validators, fullAt: state?.fullAt ?? 0, failures, nextAt: now + wait });
    await markSourceChecked(db, source.id, health.status);
    await stats({ checks: 1, failed: 1 });
    return;
  }

  if (health.notModified && reusable) {
    await store.set(source.id, { ...reusable, failures: 0, nextAt: undefined });
    await markSourceChecked(db, source.id, "healthy");
    await stats({ checks: 1, not_modified: 1 });
    return;
  }

  let result;
  try {
    result = await ingestSource(db, source, connector, { activeQueries: queries, skipKeys: reusable ? new Set(reusable.seen) : undefined });
  } catch (error) {
    // Record the attempt so the failure counts as a check: without this
    // lastCheckedAt stays old and the source would be re-fetched on every
    // scheduler tick instead of waiting out its crawl interval.
    await markSourceChecked(db, source.id, "error");
    throw error;
  }
  await markSourceChecked(db, source.id, "healthy");
  // Remembered only now that the whole feed has been ingested.
  await store.set(source.id, { sig, seen: result.itemKeys, validators: health.validators, fullAt: reusable ? reusable.fullAt : now, failures: 0 });
  const looked = result.itemsFetched - result.itemsSkipped;
  await stats({
    checks: 1,
    [looked > 0 ? "changed" : "unchanged"]: 1,
    stories_seen: result.itemsFetched,
    stories_skipped: result.itemsSkipped,
    new_articles: result.articlesCreated,
    new_mentions: result.mentionsCreated,
  });
  // Only a crawl that found something is worth a log line (thousands of sources are read every cycle).
  if (result.articlesCreated > 0 || result.mentionsCreated > 0) {
    console.log(
      `[worker] crawled source "${source.name}": ${result.itemsFetched} item(s), ` +
        `${result.articlesCreated} new article(s), ${result.mentionsCreated} new mention(s)`,
    );
  }

  if (result.newMentions.length > 0) {
    await evaluateNewMentionAlerts(emailQueue, result.newMentions);
  }
}
