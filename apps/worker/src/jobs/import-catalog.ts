import { CATALOG_IMPORT_ORDER, type ImportCandidate } from "@cim/core/catalog-import";
import {
  checkSourcePolicy,
  createSource,
  db,
  findExistingSourceUrls,
  getCatalogImportState,
  getDatabaseSizeBytes,
  listActiveSources,
  listCatalogImportAttempts,
  recordCatalogImportAttempt,
  recordCatalogImportRun,
  type Db,
} from "@cim/db";
import { discoverFeed, testSourceUrl } from "@cim/ingestion";

/** Small steady batches: the crawler's capacity and the disk are finite. */
export const IMPORT_BATCH = 50;
const CONCURRENCY = 6;
/**
 * Every source has one pending crawl job at the start of each 2-hour cycle, so a long queue alone says
 * little. Feeds are held back only when the queue is huge, or when it is long AND its oldest job has
 * waited most of a cycle (the crawler is not keeping up).
 */
export const CRAWL_BACKLOG_HARD_LIMIT = 4000;
export const CRAWL_BACKLOG_LIMIT = 400;
export const CRAWL_OLDEST_WAIT_LIMIT_MS = 90 * 60_000;
/** Don't add feeds once the database is this full a share of the volume. */
export const DB_VOLUME_SHARE = 0.6;
export const MAX_SOURCES = 9000;
const MAX_ATTEMPTS = 2;
const RETRY_AFTER_MS = 3 * 24 * 3_600_000;
const CHUNK = 400;

export type ImportDeps = {
  /** waiting + active crawl jobs */
  crawlBacklog: () => Promise<number>;
  /** how long the oldest waiting crawl job has been waiting (ms); 0 when none */
  crawlOldestWaitMs?: () => Promise<number>;
  env?: Record<string, string | undefined>;
  database?: Db;
  now?: () => Date;
  candidates?: readonly ImportCandidate[];
  testFeed?: typeof testSourceUrl;
  /** Looks for a feed on an organisation's web page (candidates marked `discover`). */
  findFeed?: typeof discoverFeed;
};

export type ImportResult = { added: number; failed: number; skipped: number; note: string | null };

/**
 * Adds the Türkiye and world catalog feeds to the crawl list, a few at a time and
 * only after each one has been fetched and read (nothing unreadable is stored).
 * An operator can pause it from /admin/sources. It stands down — and says why — when
 * the crawl queue is backed up, when the database is filling its volume, or when
 * DB_VOLUME_MB (the Postgres volume size) is not set, because without it there is
 * no way to know how much room is left. Failed feeds are retried once, days later.
 */
export async function processImportCatalogJob(deps: ImportDeps): Promise<ImportResult> {
  const database = deps.database ?? db;
  const env = deps.env ?? process.env;
  const now = (deps.now ?? (() => new Date()))();
  const stop = async (note: string): Promise<ImportResult> => {
    await recordCatalogImportRun(database, note);
    return { added: 0, failed: 0, skipped: 0, note };
  };

  const state = await getCatalogImportState(database);
  if (!state.enabled) return stop("Paused by an operator.");

  const volumeMb = Number(env.DB_VOLUME_MB);
  if (!(volumeMb > 0)) {
    return stop("Waiting for the DB_VOLUME_MB variable (the Postgres volume size in MB) — without it the import cannot tell how much disk is left.");
  }
  const sizeMb = (await getDatabaseSizeBytes(database)) / 1_048_576;
  if (sizeMb > volumeMb * DB_VOLUME_SHARE) {
    return stop(`The database uses ${Math.round(sizeMb)} MB of a ${volumeMb} MB volume (over ${Math.round(DB_VOLUME_SHARE * 100)}%) — paused until there is room.`);
  }
  const backlog = await deps.crawlBacklog();
  if (backlog > CRAWL_BACKLOG_HARD_LIMIT) return stop(`The crawl queue has ${backlog} jobs waiting — waiting for it to drain.`);
  if (backlog > CRAWL_BACKLOG_LIMIT && deps.crawlOldestWaitMs) {
    const oldest = await deps.crawlOldestWaitMs();
    if (oldest > CRAWL_OLDEST_WAIT_LIMIT_MS) {
      return stop(`The crawl queue has ${backlog} jobs waiting and the oldest has waited ${Math.round(oldest / 60_000)} minutes — waiting for it to catch up.`);
    }
  }
  if ((await listActiveSources(database)).length >= MAX_SOURCES) return stop(`Reached the ${MAX_SOURCES} source limit.`);

  // Next feeds, in catalog order, that are not sources yet and not recently failed.
  const candidates = deps.candidates ?? CATALOG_IMPORT_ORDER;
  const picked: ImportCandidate[] = [];
  for (let i = 0; i < candidates.length && picked.length < IMPORT_BATCH; i += CHUNK) {
    const chunk = candidates.slice(i, i + CHUNK);
    const urls = chunk.map((c) => c.url);
    const [existing, attempts] = await Promise.all([findExistingSourceUrls(database, urls), listCatalogImportAttempts(database, urls)]);
    for (const candidate of chunk) {
      if (picked.length >= IMPORT_BATCH) break;
      if (existing.has(candidate.url)) continue;
      const attempt = attempts.get(candidate.url);
      if (attempt?.status === "skipped" || attempt?.status === "added") continue;
      if (attempt?.status === "failed" && (attempt.attempts >= MAX_ATTEMPTS || now.getTime() - attempt.attemptedAt.getTime() < RETRY_AFTER_MS)) continue;
      picked.push(candidate);
    }
  }
  if (picked.length === 0) return stop("Finished — every catalog feed has been added or tried.");

  const testFeed = deps.testFeed ?? testSourceUrl;
  const findFeed = deps.findFeed ?? discoverFeed;
  const result: ImportResult = { added: 0, failed: 0, skipped: 0, note: null };
  const queue = [...picked];
  async function worker() {
    while (queue.length > 0) {
      const entry = queue.shift()!;
      try {
        const policy = await checkSourcePolicy(database, entry.url, false);
        if (policy) {
          await recordCatalogImportAttempt(database, { url: entry.url, catalogKey: entry.key, status: "skipped", error: policy });
          result.skipped += 1;
          continue;
        }
        let feedUrl = entry.url;
        if (entry.discover) {
          // A web page, not a feed: the feed found there is what gets stored (and policy-checked).
          const found = await findFeed(entry.url);
          if (!found.ok) {
            await recordCatalogImportAttempt(database, { url: entry.url, catalogKey: entry.key, status: "failed", error: found.message });
            result.failed += 1;
            continue;
          }
          feedUrl = found.feedUrl;
          const foundPolicy = await checkSourcePolicy(database, feedUrl, false);
          if (foundPolicy) {
            await recordCatalogImportAttempt(database, { url: entry.url, catalogKey: entry.key, status: "skipped", error: foundPolicy });
            result.skipped += 1;
            continue;
          }
        } else {
          const test = await testFeed(entry.url, "rss");
          if (!test.ok) {
            await recordCatalogImportAttempt(database, { url: entry.url, catalogKey: entry.key, status: "failed", error: test.message });
            result.failed += 1;
            continue;
          }
        }
        const created = await createSource(database, {
          name: entry.name,
          url: feedUrl,
          connector: "rss",
          type: entry.type,
          language: entry.language,
          country: entry.country,
          licenseConfirmed: false,
        });
        if (created.ok || created.reason === "duplicate") {
          await recordCatalogImportAttempt(database, { url: entry.url, catalogKey: entry.key, status: "added" });
          result.added += created.ok ? 1 : 0;
        } else {
          await recordCatalogImportAttempt(database, { url: entry.url, catalogKey: entry.key, status: "skipped", error: created.reason });
          result.skipped += 1;
        }
      } catch (error) {
        console.error(`[import-catalog] ${entry.url}:`, error);
        result.failed += 1;
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  await recordCatalogImportRun(database, null);
  console.log(`[import-catalog] added ${result.added}, failed ${result.failed}, skipped ${result.skipped}`);
  return result;
}
