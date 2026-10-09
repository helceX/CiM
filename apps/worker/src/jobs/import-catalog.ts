import { CATALOG_IMPORT_ORDER, type ImportCandidate } from "@cim/core/catalog-import";
import {
  classifyFeedFailure,
  describeTally,
  importRetryEligible,
  isTransientFeedFailure,
  looksLikeLocalFault,
  spreadByHost,
  tallyFailures,
} from "@cim/core";
import {
  checkSourcePolicy,
  countActiveSources,
  createSource,
  db,
  findExistingSourceUrls,
  getCatalogImportState,
  getDatabaseSizeBytes,
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
const CHUNK = 400;
/** A publisher with 265 category feeds is asked for two of them per batch, one after the other. */
export const PER_HOST_PER_BATCH = 2;
/** When every catalog feed is added or tried, look again hourly (a deploy can add feeds, a retry can fall due) — not every 5 minutes. */
export const FINISHED_NOTE = "Finished — every catalog feed has been added or tried.";
export const FINISHED_RECHECK_MS = 3_600_000;
/** A batch that failed for reasons of the moment is not repeated for this long. */
export const BACKOFF_NOTE = "Backing off —";
export const BACKOFF_MS = 30 * 60_000;

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
 * no way to know how much room is left.
 *
 * A failure is classified (core/feed-failure.ts): a feed that is gone or not a feed is tried twice, three days apart;
 * one that failed for a reason of the moment (timeout, network, 429, 5xx) is tried again after a day, up to five
 * times. When a whole batch fails that way across many publishers the fault is ours (a busy worker, the network):
 * those failures are not recorded against the feeds and the import backs off for half an hour. At most two feeds of
 * one publisher are tried per batch and never at the same time.
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
  if ((await countActiveSources(database)) >= MAX_SOURCES) return stop(`Reached the ${MAX_SOURCES} source limit.`);

  // The reasons above are checked every run; these two are holds the import set itself, so it does not repeat the scan
  // (and, after a backoff, the same fetches) until they have run out. Resuming from /admin/sources clears the note.
  const sinceLastRun = state.lastRunAt ? now.getTime() - state.lastRunAt.getTime() : Infinity;
  const held = { added: 0, failed: 0, skipped: 0, note: state.lastNote };
  if (state.lastNote === FINISHED_NOTE && sinceLastRun < FINISHED_RECHECK_MS) return held;
  if (state.lastNote?.startsWith(BACKOFF_NOTE) && sinceLastRun < BACKOFF_MS) return held;

  // Next feeds, in catalog order, that are not sources yet and are due: never tried, or failed and now worth another look.
  const candidates = deps.candidates ?? CATALOG_IMPORT_ORDER;
  const due: ImportCandidate[] = [];
  let picked: ImportCandidate[] = [];
  for (let i = 0; i < candidates.length && picked.length < IMPORT_BATCH; i += CHUNK) {
    const chunk = candidates.slice(i, i + CHUNK);
    const urls = chunk.map((c) => c.url);
    const [existing, attempts] = await Promise.all([findExistingSourceUrls(database, urls), listCatalogImportAttempts(database, urls)]);
    for (const candidate of chunk) {
      if (existing.has(candidate.url)) continue;
      const attempt = attempts.get(candidate.url);
      if (attempt && !importRetryEligible(attempt, now)) continue; // added, skipped, or failed too recently / too often
      due.push(candidate);
    }
    picked = spreadByHost(due, IMPORT_BATCH, PER_HOST_PER_BATCH);
  }
  if (picked.length === 0) return stop(FINISHED_NOTE);

  const testFeed = deps.testFeed ?? testSourceUrl;
  const findFeed = deps.findFeed ?? discoverFeed;
  const result: ImportResult = { added: 0, failed: 0, skipped: 0, note: null };
  const queue = [...picked];
  const inFlightHosts = new Set<string>();
  const failures: { url: string; message: string }[] = [];
  /** Failures that say something about the moment, not the feed: written only once the batch shows they were not ours. */
  const heldBack: { entry: ImportCandidate; message: string }[] = [];

  const hostOf = (url: string) => {
    try {
      return new URL(url).host;
    } catch {
      return url;
    }
  };
  /** The first waiting feed whose publisher is not being asked for something right now. */
  const takeNext = (): ImportCandidate | undefined => {
    const index = queue.findIndex((entry) => !inFlightHosts.has(hostOf(entry.url)));
    return index < 0 ? undefined : queue.splice(index, 1)[0];
  };
  const fail = async (entry: ImportCandidate, message: string) => {
    result.failed += 1;
    failures.push({ url: entry.url, message });
    if (isTransientFeedFailure(classifyFeedFailure(message))) {
      heldBack.push({ entry, message });
      return;
    }
    await recordCatalogImportAttempt(database, { url: entry.url, catalogKey: entry.key, status: "failed", error: message });
  };

  async function worker() {
    for (let entry = takeNext(); entry; entry = takeNext()) {
      const host = hostOf(entry.url);
      inFlightHosts.add(host);
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
            await fail(entry, found.message);
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
            await fail(entry, test.message);
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
        // Not silent and not endless: the feed is recorded as failed (with the reason), so it is not picked again at once.
        const message = `Unexpected error: ${error instanceof Error ? error.message : String(error)}`;
        console.error(`[import-catalog] ${entry.url}:`, error);
        try {
          await fail(entry, message);
        } catch (recordError) {
          console.error(`[import-catalog] could not record the failure of ${entry.url}:`, recordError);
        }
      } finally {
        inFlightHosts.delete(host);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const tally = tallyFailures(failures);
  const localFault = looksLikeLocalFault(tally, result.added);
  if (localFault) {
    // Not the feeds' fault: leave them unrecorded so they are tried again, and wait before the next batch.
    result.note = `${BACKOFF_NOTE} ${tally.total} of ${picked.length} feeds failed (${describeTally(tally)}) across ${tally.hosts} sites, which points at the worker or its network, not the feeds; they are not held against the feeds. Next try in ${BACKOFF_MS / 60_000} minutes.`;
  } else {
    for (const { entry, message } of heldBack) {
      await recordCatalogImportAttempt(database, { url: entry.url, catalogKey: entry.key, status: "failed", error: message });
    }
  }
  await recordCatalogImportRun(database, result.note);
  console.log(
    `[import-catalog] added ${result.added}, failed ${result.failed}, skipped ${result.skipped}` +
      (tally.total > 0 ? ` — failures: ${describeTally(tally)} over ${tally.hosts} sites${localFault ? " (not recorded against the feeds: backing off)" : ""}` : ""),
  );
  return result;
}
