/**
 * Hourly crawl counters the worker keeps in Redis (apps/worker crawl-stats.ts) and /admin/sources reads back. They exist so a
 * change to the crawl can be judged on numbers: how many fetches were answered "not modified", how many feeds had
 * nothing new, how many were left alone after repeated failures.
 */
export const CRAWL_STAT_FIELDS = [
  "checks", // crawl jobs that got as far as the publisher
  "not_modified", // answered 304: nothing downloaded, parsed or stored
  "unchanged", // downloaded, but every story was already handled
  "changed", // at least one story was looked at in full
  "failed", // the publisher could not be read (error, blocked, refused)
  "backoff_skips", // left alone because earlier failures asked for a longer wait
  "stories_seen", // items in the feeds that were read
  "stories_skipped", // of those, left alone as already handled
  "new_articles",
  "new_mentions",
] as const;
export type CrawlStatField = (typeof CRAWL_STAT_FIELDS)[number];

export const CRAWL_STATS_KEY_PREFIX = "crawl:stats:";
export const CRAWL_STATS_TTL_SECONDS = 4 * 24 * 3600;

/** The Redis hash for the hour containing `at` (UTC), e.g. crawl:stats:2026100912. */
export function crawlStatsKey(at: Date): string {
  return `${CRAWL_STATS_KEY_PREFIX}${at.toISOString().slice(0, 13).replace(/[-T]/g, "")}`;
}

export type CrawlStatTotals = Record<CrawlStatField, number>;

export function emptyCrawlStats(): CrawlStatTotals {
  return Object.fromEntries(CRAWL_STAT_FIELDS.map((field) => [field, 0])) as CrawlStatTotals;
}
