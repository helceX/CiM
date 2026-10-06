import { sql } from "drizzle-orm";
import type { Db } from "../client";

/** Size of the whole database on disk — what fills the Postgres volume. */
export async function getDatabaseSizeBytes(db: Db): Promise<number> {
  const result = await db.execute<{ size: string }>(sql`select pg_database_size(current_database())::text as size`);
  return Number(result.rows[0]?.size ?? 0);
}

export type TableSize = { name: string; bytes: number; rows: number };

/** The biggest tables (data + indexes), so "what is using the disk" has an answer. */
export async function listLargestTables(db: Db, limit = 8): Promise<TableSize[]> {
  const result = await db.execute<{ name: string; bytes: string; rows: string }>(sql`
    select c.relname as name, pg_total_relation_size(c.oid)::text as bytes, greatest(c.reltuples, 0)::bigint::text as rows
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where c.relkind = 'r' and n.nspname = 'public'
    order by pg_total_relation_size(c.oid) desc
    limit ${limit}
  `);
  return result.rows.map((row) => ({ name: row.name, bytes: Number(row.bytes), rows: Number(row.rows) }));
}

/** How long unmatched stories are kept; `ARTICLE_CACHE_DAYS` overrides it on the worker (a smaller disk wants fewer days). */
export const ARTICLE_CACHE_DAYS = 30;

/**
 * Stored stories that no customer's monitoring matched are only a cache — for the
 * 30-day history a new monitoring is matched against, and for story clustering —
 * so once they are older than that they are deleted. Stories that have mentions
 * stay until the customers' own retention removes the mentions. Deletes in
 * batches so a big first run never holds one huge transaction.
 */
export async function pruneOrphanArticles(
  db: Db,
  options: { olderThanDays?: number; batchSize?: number; maxBatches?: number } = {},
): Promise<number> {
  const days = options.olderThanDays ?? ARTICLE_CACHE_DAYS;
  const batchSize = options.batchSize ?? 5000;
  const maxBatches = options.maxBatches ?? 40;
  let deleted = 0;
  for (let i = 0; i < maxBatches; i++) {
    const result = await db.execute(sql`
      delete from articles
      where id in (
        select a.id from articles a
        where a.created_at < now() - (${days}::text || ' days')::interval
          and not exists (select 1 from mentions m where m.article_id = a.id)
        limit ${batchSize}
      )
    `);
    const n = result.rowCount ?? 0;
    deleted += n;
    if (n < batchSize) break;
  }
  return deleted;
}

export type PrunePreview = {
  /** stories no monitoring matched */
  unmatchedStories: number;
  /** stories customers' monitorings matched (deleting them deletes those mentions) */
  matchedStories: number;
  /** mentions that would disappear with the matched stories */
  mentions: number;
};

/** What `pruneArticles` would delete for this age — shown before anything is deleted. */
export async function previewPrune(db: Db, olderThanDays: number): Promise<PrunePreview> {
  const result = await db.execute<{ unmatched: string; matched: string; mentions: string }>(sql`
    select
      count(*) filter (where not exists (select 1 from mentions m where m.article_id = a.id))::text as unmatched,
      count(*) filter (where exists (select 1 from mentions m where m.article_id = a.id))::text as matched,
      coalesce(sum((select count(*) from mentions m where m.article_id = a.id)), 0)::text as mentions
    from articles a
    where a.created_at < now() - (${olderThanDays}::text || ' days')::interval
  `);
  const row = result.rows[0];
  return {
    unmatchedStories: Number(row?.unmatched ?? 0),
    matchedStories: Number(row?.matched ?? 0),
    mentions: Number(row?.mentions ?? 0),
  };
}

/**
 * The operator's "free space now": delete stored stories older than `olderThanDays`
 * (0 = all of them). With `includeMatched` that also removes stories customers'
 * monitorings matched — and, by cascade, those mentions. Not undone.
 * Space goes back to Postgres for new rows at once; the file only shrinks after a VACUUM FULL.
 */
export async function pruneArticles(
  db: Db,
  options: { olderThanDays: number; includeMatched: boolean; batchSize?: number; maxBatches?: number },
): Promise<number> {
  if (!options.includeMatched) {
    return pruneOrphanArticles(db, { olderThanDays: options.olderThanDays, batchSize: options.batchSize, maxBatches: options.maxBatches });
  }
  const batchSize = options.batchSize ?? 5000;
  const maxBatches = options.maxBatches ?? 200;
  let deleted = 0;
  for (let i = 0; i < maxBatches; i++) {
    const result = await db.execute(sql`
      delete from articles
      where id in (
        select id from articles
        where created_at < now() - (${options.olderThanDays}::text || ' days')::interval
        limit ${batchSize}
      )
    `);
    const n = result.rowCount ?? 0;
    deleted += n;
    if (n < batchSize) break;
  }
  return deleted;
}
