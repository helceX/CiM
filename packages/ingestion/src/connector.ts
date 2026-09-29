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
  // docs/architecture/ADR-006-SOCIAL-LISTENING.md — set only by social
  // connectors (Mock today; X/Instagram/etc. are future phases). When
  // socialAuthorExternalId is present, the pipeline resolves/creates a
  // socialProfiles row and links it via articles.authorProfileId — a
  // structured author distinct from the plain-string `authorName` above.
  // Absent (not just null) on every non-social connector.
  socialPlatform?: string;
  socialAuthorExternalId?: string;
  socialAuthorHandle?: string;
  socialAuthorDisplayName?: string | null;
  socialAuthorProfileUrl?: string | null;
  socialAuthorFollowers?: number | null;
  socialAuthorVerified?: boolean | null;
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
