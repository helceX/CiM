import { createHash } from "node:crypto";
import type { ActiveMonitoringQuery } from "@cim/db";
import type { Source } from "@cim/db/schema";

/**
 * What a crawl remembers about a feed so the next one can skip work that cannot change anything (see
 * apps/worker crawl-source.ts for how it is stored and used). All of it is a shortcut: forgetting it, or finding
 * it stale, only means the feed is processed in full, as every crawl used to be.
 */

/** A short, stable key for one feed item (its canonical address). 72 bits: a collision would skip one story for a day. */
export function itemKey(canonicalUrl: string): string {
  return createHash("sha1").update(canonicalUrl).digest("base64url").slice(0, 12);
}

/**
 * Changes whenever something that decides what a story matches changes: the set of active monitorings (a new one, an
 * edited one — `updatedAt` moves — a paused or deleted one) or the source's own type, country or language. Items already
 * ingested under a different signature are looked at again, so a new monitoring never misses what a feed already holds.
 */
export function crawlSignature(source: Pick<Source, "type" | "country" | "language">, queries: readonly ActiveMonitoringQuery[]): string {
  const hash = createHash("sha1");
  hash.update(`${source.type}|${source.country ?? ""}|${source.language ?? ""}`);
  for (const query of [...queries].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    hash.update(`|${query.id}:${query.updatedAt.getTime()}`);
  }
  return hash.digest("base64url").slice(0, 16);
}
