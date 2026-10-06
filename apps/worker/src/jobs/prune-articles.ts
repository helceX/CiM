import { ARTICLE_CACHE_DAYS, db, pruneOrphanArticles } from "@cim/db";

/** Daily: delete stored stories no customer's monitoring matched once they are older than the history window. */
export async function processPruneArticlesJob(): Promise<number> {
  const deleted = await pruneOrphanArticles(db, { olderThanDays: ARTICLE_CACHE_DAYS });
  console.log(`[prune-articles] deleted ${deleted} unmatched stories older than ${ARTICLE_CACHE_DAYS} days`);
  return deleted;
}
