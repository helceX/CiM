import { db, listActiveMonitoringQueriesForSourceType, type ActiveMonitoringQuery } from "@cim/db";

/**
 * Every crawl matches a story against the active monitorings of the source's type, and used to read them all from
 * Postgres each time: with thousands of sources a cycle that is thousands of identical reads of the same few hundred
 * rows. They are kept for a minute here, per source type, and shared by the crawls running at once. A monitoring saved
 * now is matched from the next minute on; one that is saved is also back-filled over the stories already stored
 * (monitoring-backfill.ts), so nothing is lost in between.
 */
export const ACTIVE_QUERIES_TTL_MS = 60_000;

type Entry = { at: number; queries: Promise<ActiveMonitoringQuery[]> };
const entries = new Map<string, Entry>();

export function getActiveQueries(sourceType: string, now: number = Date.now()): Promise<ActiveMonitoringQuery[]> {
  const hit = entries.get(sourceType);
  if (hit && now - hit.at < ACTIVE_QUERIES_TTL_MS) return hit.queries;
  const queries = listActiveMonitoringQueriesForSourceType(db, sourceType);
  const entry: Entry = { at: now, queries };
  entries.set(sourceType, entry);
  // A failed read must not be kept for a minute.
  queries.catch(() => {
    if (entries.get(sourceType) === entry) entries.delete(sourceType);
  });
  return queries;
}

/** For tests. */
export function clearActiveQueriesCache(): void {
  entries.clear();
}
