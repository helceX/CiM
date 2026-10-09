import type { Source } from "@cim/db/schema";
import type { ArticlePrint } from "@cim/core";

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
  /** Set when the story ran in a printed edition (clipping providers only). */
  print?: ArticlePrint | null;
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

export type SourceHealthStatus =
  | "healthy"
  | "delayed"
  | "error"
  | "blocked"
  | "unavailable";

/** What the publisher said about the feed's version last time (HTTP validators). */
export type FeedValidators = { etag?: string; lastModified?: string };

export type SourceHealth = {
  status: SourceHealthStatus;
  message?: string;
  /** The publisher answered 304 to a conditional request: nothing changed since `hints.validators`. */
  notModified?: boolean;
  /** The version the publisher reported with a full answer — kept by the caller once the feed has been ingested. */
  validators?: FeedValidators;
  /** How long the publisher asked us to stay away (Retry-After), when it said so. */
  retryAfterMs?: number;
};

/** Passed to `healthCheck` by a caller that remembers the previous crawl (apps/worker crawl-source). */
export type HealthHints = { validators?: FeedValidators };

export interface SourceConnector {
  fetch(source: Source): Promise<RawFetchResult[]>;
  healthCheck(source: Source, hints?: HealthHints): Promise<SourceHealth>;
}
