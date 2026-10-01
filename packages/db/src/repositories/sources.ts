import { eq, ne, sql } from "drizzle-orm";
import type { Db } from "../client";
import { sources } from "../schema/content";

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
  connector: "rss" | "sitemap";
  type: string;
  language: string;
  country: string;
};

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
): Promise<{ ok: true; id: string } | { ok: false; reason: "duplicate" | "invalid_url" }> {
  let host: string;
  try {
    host = new URL(input.url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return { ok: false, reason: "invalid_url" };
  }
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
        type: input.type,
        language: input.language,
        country: input.country,
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
  const rows = await db
    .update(sources)
    .set({ status: enabled ? "delayed" : "unavailable", updatedAt: new Date() })
    .where(eq(sources.id, sourceId))
    .returning({ id: sources.id });
  return rows.length > 0;
}
