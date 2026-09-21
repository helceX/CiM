import type { Source } from "@cim/db/schema";

/**
 * docs/architecture/INGESTION.md — every connector (Mock, RSS, Sitemap,
 * Web, API, Social, YouTube, Podcast, Broadcast, Custom) implements this
 * one contract; everything downstream (normalize → dedupe → index → AI →
 * alert) is connector-agnostic. `fetch` never bypasses access control,
 * paywalls, or robots.txt — a source that can't be legitimately reached
 * reports `unavailable` from `healthCheck`, it never fabricates results.
 */
export type RawFetchResult = {
  /** Connector-specific identifier, stable across repeat fetches of the same item. */
  externalId: string;
  canonicalUrl: string;
  title: string;
  bodyText: string;
  language?: string | null;
  publishedAt: Date | null;
  authorName?: string | null;
};

export type SourceHealthStatus = "healthy" | "delayed" | "error" | "blocked" | "unavailable";

export type SourceHealth = {
  status: SourceHealthStatus;
  message?: string;
};

export interface SourceConnector {
  fetch(source: Source): Promise<RawFetchResult[]>;
  healthCheck(source: Source): Promise<SourceHealth>;
}
