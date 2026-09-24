import { eq, ne } from "drizzle-orm";
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
