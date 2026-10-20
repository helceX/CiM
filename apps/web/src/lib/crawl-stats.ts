import "server-only";
import { CRAWL_STAT_FIELDS, crawlStatsKey, emptyCrawlStats, type CrawlStatTotals } from "@cim/core";
import { getRedis } from "./redis";

/**
 * The worker's hourly crawl counters (apps/worker/src/crawl-state.ts), summed over the last `hours` hours. Null when
 * Redis cannot be read — the admin page then says so instead of showing zeros that look like "nothing happened".
 */
export async function getCrawlStats(hours = 24, now: Date = new Date()): Promise<CrawlStatTotals | null> {
  try {
    const pipeline = getRedis().pipeline();
    for (let h = 0; h < hours; h += 1) pipeline.hgetall(crawlStatsKey(new Date(now.getTime() - h * 3_600_000)));
    const results = await pipeline.exec();
    if (!results || results.length !== hours) return null;
    const totals = emptyCrawlStats();
    for (const [error, hash] of results) {
      if (error || !hash) return null;
      for (const field of CRAWL_STAT_FIELDS) {
        const value = Number((hash as Record<string, string>)[field] ?? 0);
        if (!Number.isSafeInteger(value) || value < 0) return null;
        totals[field] += value;
      }
    }
    return totals;
  } catch {
    return null;
  }
}
