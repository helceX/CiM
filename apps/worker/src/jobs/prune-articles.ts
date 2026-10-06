import { ARTICLE_CACHE_DAYS, db, pruneOrphanArticles } from "@cim/db";

/** `ARTICLE_CACHE_DAYS` (worker env) shortens or lengthens how long unmatched stories are kept. */
export function articleCacheDays(env: Record<string, string | undefined> = process.env): number {
  const days = Number(env.ARTICLE_CACHE_DAYS);
  return Number.isInteger(days) && days >= 1 && days <= 365 ? days : ARTICLE_CACHE_DAYS;
}

/** Daily (and once at start-up): delete stored stories no customer's monitoring matched once they are older than the history window. */
export async function processPruneArticlesJob(): Promise<number> {
  const days = articleCacheDays();
  const deleted = await pruneOrphanArticles(db, { olderThanDays: days });
  console.log(`[prune-articles] deleted ${deleted} unmatched stories older than ${days} days`);
  return deleted;
}
