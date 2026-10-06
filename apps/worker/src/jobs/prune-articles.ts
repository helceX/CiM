import { ARTICLE_CACHE_DAYS, db, getDatabaseSizeBytes, pruneOrphanArticles } from "@cim/db";

/** `ARTICLE_CACHE_DAYS` (worker env) shortens or lengthens how long unmatched stories are kept. */
export function articleCacheDays(env: Record<string, string | undefined> = process.env): number {
  const days = Number(env.ARTICLE_CACHE_DAYS);
  return Number.isInteger(days) && days >= 1 && days <= 365 ? days : ARTICLE_CACHE_DAYS;
}

/**
 * When the database fills its volume the configured window is shortened instead of waiting for an
 * outage: past 70% of `DB_VOLUME_MB` unmatched stories are kept at most 7 days, past 85% at most 3.
 * Only unmatched stories are ever pruned, so no customer mention is touched.
 */
export function effectiveCacheDays(configuredDays: number, sizeMb: number, volumeMb: number): number {
  if (!(volumeMb > 0)) return configuredDays;
  const share = sizeMb / volumeMb;
  if (share > 0.85) return Math.min(configuredDays, 3);
  if (share > 0.7) return Math.min(configuredDays, 7);
  return configuredDays;
}

/** Every 6 hours (and once at start-up): delete stored stories no customer's monitoring matched once they are older than the history window. */
export async function processPruneArticlesJob(env: Record<string, string | undefined> = process.env): Promise<number> {
  const configured = articleCacheDays(env);
  const sizeMb = (await getDatabaseSizeBytes(db)) / 1_048_576;
  const days = effectiveCacheDays(configured, sizeMb, Number(env.DB_VOLUME_MB));
  if (days < configured) {
    console.warn(`[prune-articles] database is ${Math.round(sizeMb)} MB of ${env.DB_VOLUME_MB} MB — keeping unmatched stories ${days} days instead of ${configured}`);
  }
  const deleted = await pruneOrphanArticles(db, { olderThanDays: days });
  console.log(`[prune-articles] deleted ${deleted} unmatched stories older than ${days} days`);
  return deleted;
}
