import { and, eq, inArray, isNull, ne, notInArray, or, sql } from "drizzle-orm";
import { crawlIntervalTable, hostMatchesDomain, hostOfUrl, inferCountryFromHost, isLicenseRequiredHost } from "@cim/core";
import type { Db } from "../client";
import { articles, sources } from "../schema/content";
import { isHostBlocked, listBlockedDomains } from "./compliance";

/** Sources are global/reference data (ADR-001) — no tenant scoping here. */

/**
 * Every status is retried on the next crawl tick except "unavailable" —
 * that one means no connector is registered for this source's connector
 * type (processCrawlSourceJob's own early-return), a code-level gap
 * retrying can never fix until a connector ships. "delayed"/"error"/
 * "blocked" are all transient outcomes of a single healthCheck
 * (web-connector.ts, api-connector.ts) — excluding them here (as a
 * previous status = "healthy" filter did) would let one bad healthCheck
 * permanently stop a source from ever being crawled again, since nothing
 * else in the codebase ever flips a source's status back to "healthy".
 */
export async function listActiveSources(db: Db) {
  return db.select().from(sources).where(ne(sources.status, "unavailable"));
}

/**
 * The sources whose crawl interval has run out (never checked, or last checked longer ago than their connector's
 * interval — core/crawl-interval.ts), selected in the database. The scheduler ticks every 30 seconds; reading every
 * source row (up to 9,000, all columns) to find the few dozen that are due cost about 160 ms of Node CPU per tick.
 * Same rule as isSourceDue, which the caller still applies to what comes back.
 */
export async function listDueSources(db: Db, now: Date) {
  const { byConnector, fallbackMs } = crawlIntervalTable();
  const intervalMs = sql`case ${sources.connector} ${sql.join(
    Object.entries(byConnector).map(([connector, ms]) => sql`when ${connector} then ${ms}::double precision`),
    sql` `,
  )} else ${fallbackMs}::double precision end`;
  return db
    .select({ id: sources.id, connector: sources.connector, lastCheckedAt: sources.lastCheckedAt })
    .from(sources)
    .where(
      and(
        ne(sources.status, "unavailable"),
        or(
          isNull(sources.lastCheckedAt),
          sql`${sources.lastCheckedAt} <= ${now.toISOString()}::timestamptz - (${intervalMs}) * interval '1 millisecond'`,
        ),
      ),
    );
}

/** How many sources are not "unavailable" — for callers that only need the number, not up to 9,000 full rows. */
export async function countActiveSources(db: Db): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(sources).where(ne(sources.status, "unavailable"));
  return Number(row?.n ?? 0);
}

export async function markSourceChecked(
  db: Db,
  sourceId: string,
  status: "healthy" | "delayed" | "error" | "blocked" | "unavailable",
) {
  await db
    .update(sources)
    .set({ status, lastCheckedAt: new Date(), updatedAt: new Date() })
    .where(eq(sources.id, sourceId));
}

export type NewSourceInput = {
  name: string;
  url: string;
  connector: "rss" | "sitemap" | "api";
  type: string;
  language: string;
  country: string;
  /** The admin states Mediaory holds a written licence from this agency. */
  licenseConfirmed?: boolean;
  /** Only for connector "api": the provider's key and the header it goes in (never returned by any read). */
  apiKey?: string;
  apiKeyHeaderName?: string;
};

export type SourcePolicyFailure = "invalid_url" | "blocked" | "license_required";

/**
 * Whether we may even contact this address: not a blocked publisher, and an
 * agency only with a confirmed licence. The admin routes call this BEFORE
 * fetching anything, so a publisher who asked us to stop is never requested again.
 */
export async function checkSourcePolicy(
  db: Db,
  url: string,
  licenseConfirmed = false,
): Promise<SourcePolicyFailure | null> {
  const host = hostOfUrl(url);
  if (!host) return "invalid_url";
  if (await isHostBlocked(db, host)) return "blocked";
  if (isLicenseRequiredHost(host) && !licenseConfirmed) return "license_required";
  return null;
}

/**
 * Adds an operator-defined crawl source. Hand-added sources always store
 * titles/excerpts only (no full text, no media) — the SourcePolicy default —
 * and are deduplicated on the feed URL, so adding the same feed twice (a
 * double click, or the catalog and the manual form) never doubles its crawl.
 * The advisory lock makes that check-then-insert atomic.
 */
export async function createSource(
  db: Db,
  input: NewSourceInput,
): Promise<
  { ok: true; id: string } | { ok: false; reason: "duplicate" | "invalid_url" | "blocked" | "license_required" }
> {
  const failure = await checkSourcePolicy(db, input.url, input.licenseConfirmed);
  if (failure) return { ok: false, reason: failure };
  const host = hostOfUrl(input.url)!;
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('sources:create'))`);
    const [existing] = await tx
      .select({ id: sources.id })
      .from(sources)
      .where(eq(sources.url, input.url))
      .limit(1);
    if (existing) return { ok: false as const, reason: "duplicate" as const };
    const [row] = await tx
      .insert(sources)
      .values({
        name: input.name,
        domain: host,
        url: input.url,
        connector: input.connector,
        apiKey: input.connector === "api" ? (input.apiKey ?? null) : null,
        apiKeyHeaderName: input.connector === "api" ? (input.apiKeyHeaderName ?? null) : null,
        type: input.type,
        language: input.language,
        country: input.country === "ZZ" ? null : input.country,
        status: "healthy",
        canStoreFullText: false,
        canDisplayFullText: false,
        canDisplayExcerpt: true,
        canStoreMedia: false,
        canProcessAi: true,
      })
      .returning({ id: sources.id });
    if (!row) throw new Error("failed to create source");
    return { ok: true as const, id: row.id };
  });
}

/**
 * Pauses or resumes crawling of one source without deleting it (deleting a
 * source would cascade away its articles and every tenant's mentions of
 * them). "unavailable" is the status the crawl scheduler already skips;
 * resuming sets "delayed" until the next crawl's health check decides.
 */
export async function setSourceCrawlEnabled(
  db: Db,
  sourceId: string,
  enabled: boolean,
): Promise<boolean> {
  if (enabled) {
    // A blocked publisher's sources can never be resumed (see blockDomain).
    const [source] = await db.select({ domain: sources.domain }).from(sources).where(eq(sources.id, sourceId));
    if (source && (await isHostBlocked(db, source.domain))) return false;
  }
  const rows = await db
    .update(sources)
    .set({ status: enabled ? "delayed" : "unavailable", updatedAt: new Date() })
    .where(eq(sources.id, sourceId))
    .returning({ id: sources.id });
  return rows.length > 0;
}

export type SourceBulkFilter = {
  /** ISO country codes; omitted = every country (the "World" scope). */
  countries?: string[];
  /** `Source.type` values; omitted = every type. */
  types?: string[];
  /** Only these sources (the admin's explicit selection); omitted = by filter. */
  ids?: string[];
};

/** Fake/test connectors are not real crawl targets and are never touched in bulk. */
const NON_CRAWL_CONNECTORS = ["mock", "mock-social"];

/**
 * Pauses or resumes many sources at once — the "stop everything" switch and
 * its scoped versions (one country, one continent, only forums …). Like the
 * single toggle it never deletes anything, and resuming skips every source on
 * a blocked publisher's domain. Returns how many sources actually changed.
 */
export async function bulkSetSourcesCrawlEnabled(
  db: Db,
  filter: SourceBulkFilter,
  enabled: boolean,
): Promise<{ changed: number; skippedBlocked: number }> {
  const scope = and(
    notInArray(sources.connector, NON_CRAWL_CONNECTORS),
    filter.countries ? inArray(sources.country, filter.countries) : undefined,
    filter.types ? inArray(sources.type, filter.types) : undefined,
    filter.ids ? inArray(sources.id, filter.ids) : undefined,
    // Only rows that would actually change state.
    enabled ? eq(sources.status, "unavailable") : ne(sources.status, "unavailable"),
  );

  let blockedIds: string[] = [];
  if (enabled) {
    const blocked = await listBlockedDomains(db);
    if (blocked.length > 0) {
      const candidates = await db
        .select({ id: sources.id, domain: sources.domain })
        .from(sources)
        .where(scope);
      blockedIds = candidates
        .filter((row) => blocked.some((entry) => hostMatchesDomain(row.domain, entry.domain)))
        .map((row) => row.id);
    }
  }

  const rows = await db
    .update(sources)
    .set({ status: enabled ? "delayed" : "unavailable", updatedAt: new Date() })
    .where(and(scope, blockedIds.length > 0 ? notInArray(sources.id, blockedIds) : undefined))
    .returning({ id: sources.id });
  return { changed: rows.length, skippedBlocked: blockedIds.length };
}

/**
 * Gives sources with no country the one their web address points to (bebka.org.tr → Türkiye, spiegel.de → Germany),
 * so they appear in the right country cluster and count for a monitoring limited to that country. Only a country's
 * own ending is used; .com/.org sites stay unknown. Never overwrites a country that is already set.
 */
export async function fillMissingSourceCountries(db: Db): Promise<{ checked: number; updated: number; byCountry: Record<string, number> }> {
  const rows = await db.select({ id: sources.id, domain: sources.domain }).from(sources).where(isNull(sources.country));
  const idsByCountry = new Map<string, string[]>();
  for (const row of rows) {
    const code = inferCountryFromHost(row.domain);
    if (code) idsByCountry.set(code, [...(idsByCountry.get(code) ?? []), row.id]);
  }
  const byCountry: Record<string, number> = {};
  let updated = 0;
  for (const [code, ids] of idsByCountry) {
    for (let i = 0; i < ids.length; i += 500) {
      const changed = await db
        .update(sources)
        .set({ country: code, updatedAt: new Date() })
        .where(and(inArray(sources.id, ids.slice(i, i + 500)), isNull(sources.country)))
        .returning({ id: sources.id });
      updated += changed.length;
      byCountry[code] = (byCountry[code] ?? 0) + changed.length;
    }
  }
  return { checked: rows.length, updated, byCountry };
}

export type CrawlCoverage = {
  /** Sources the crawler scans (everything not paused). */
  activeSources: number;
  /** Of those, how many have been scanned at least once. */
  scannedSources: number;
  /** Most recent scan of any source; null before the first one. */
  lastScanAt: Date | null;
  /** Stories stored in the last 24 hours, across all sources. */
  storiesLast24h: number;
};

/** What the crawler has actually been doing — shown on the Monitoring page so "is it running?" has an answer. */
export async function getCrawlCoverage(db: Db): Promise<CrawlCoverage> {
  const [sourceRow] = await db
    .select({
      active: sql<number>`count(*)::int`,
      scanned: sql<number>`count(${sources.lastCheckedAt})::int`,
      last: sql<Date | null>`max(${sources.lastCheckedAt})`,
    })
    .from(sources)
    .where(ne(sources.status, "unavailable"));
  const [articleRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(articles)
    // fetched_at is indexed (created_at is not) and holds the same instant: counting by created_at scanned the whole
    // articles table (~96 ms and parallel workers on 590k rows) on every Monitoring page view.
    .where(sql`${articles.fetchedAt} >= now() - interval '24 hours'`);
  return {
    activeSources: Number(sourceRow?.active ?? 0),
    scannedSources: Number(sourceRow?.scanned ?? 0),
    lastScanAt: sourceRow?.last ? new Date(sourceRow.last) : null,
    storiesLast24h: Number(articleRow?.n ?? 0),
  };
}

/** Which of these feed addresses are already stored as sources (exact match). */
export async function findExistingSourceUrls(db: Db, urls: string[]): Promise<Set<string>> {
  if (urls.length === 0) return new Set();
  const rows = await db.select({ url: sources.url }).from(sources).where(inArray(sources.url, urls));
  return new Set(rows.map((row) => row.url).filter((url): url is string => Boolean(url)));
}

/** Names and addresses for a handful of source ids (admin drill-downs). */
export async function getSourceLabels(db: Db, ids: string[]): Promise<Map<string, { name: string; url: string | null }>> {
  if (ids.length === 0) return new Map();
  const rows = await db.select({ id: sources.id, name: sources.name, url: sources.url }).from(sources).where(inArray(sources.id, ids));
  return new Map(rows.map((row) => [row.id, { name: row.name, url: row.url }]));
}
