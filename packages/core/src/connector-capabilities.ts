/**
 * docs/architecture/ADR-004-INGESTION.md / master prompt §28 "Platform
 * Capability Matrix" — a capability is a property of a *connector type*
 * (what MockNewsConnector/RSSConnector/etc., defined in
 * packages/ingestion, can actually do), not of an individual Source row,
 * so this is a static lookup, not a DB table. Lives in packages/core
 * (not packages/ingestion, which pulls in connector-implementation
 * dependencies apps/web has no reason to bundle) so both apps/web
 * (Admin UI) and apps/worker can read it without apps/web taking on an
 * ingestion dependency it doesn't otherwise have. The UI (Admin source
 * health) reads this to render what a source can actually deliver
 * instead of implying a capability that isn't there — "no fake data"
 * (brief §182–184) applies to capabilities, not just metrics.
 */
export type ConnectorCapabilityStatus =
  | "supported"
  | "partial"
  | "provider_required"
  | "unavailable";

export type ConnectorCapabilities = {
  /** Fetching new content at all. */
  searchPosts: ConnectorCapabilityStatus;
  /** Likes/comments/shares/views (packages/db's engagementMetrics). */
  engagementMetrics: ConnectorCapabilityStatus;
  /** Follower counts, verified status, etc. (socialProfiles). */
  authorMetrics: ConnectorCapabilityStatus;
  /** Fetching content older than the connector's current polling window. */
  historicalSearch: ConnectorCapabilityStatus;
  /** Fetching content shortly after it's published, not just on a slow crawl cycle. */
  realTimeSearch: ConnectorCapabilityStatus;
  /** Uses the platform's own official API, per master prompt §29's "official API first". */
  officialApi: ConnectorCapabilityStatus;
};

/**
 * Connectors that exist in code today, plus the not-yet-implemented
 * types `sources.connector`'s schema comment already names as future
 * slots (docs/migration/CIM_V2_CHANGE_REPORT.md) — listed here as
 * entirely `unavailable`/`provider_required` so the UI can say "not yet
 * supported" honestly rather than guessing at an unregistered
 * connector's capabilities.
 */
export const CONNECTOR_CAPABILITIES: Record<string, ConnectorCapabilities> = {
  mock: {
    searchPosts: "supported",
    engagementMetrics: "unavailable",
    authorMetrics: "unavailable",
    historicalSearch: "unavailable",
    realTimeSearch: "supported",
    officialApi: "unavailable",
  },
  "mock-social": {
    searchPosts: "supported",
    engagementMetrics: "unavailable",
    authorMetrics: "supported",
    historicalSearch: "unavailable",
    realTimeSearch: "supported",
    officialApi: "unavailable",
  },
  rss: {
    searchPosts: "supported",
    engagementMetrics: "unavailable",
    authorMetrics: "unavailable",
    historicalSearch: "unavailable",
    realTimeSearch: "supported",
    officialApi: "unavailable",
  },
  sitemap: {
    searchPosts: "supported",
    engagementMetrics: "unavailable",
    authorMetrics: "unavailable",
    historicalSearch: "partial",
    realTimeSearch: "partial",
    officialApi: "unavailable",
  },
  web: {
    searchPosts: "supported",
    engagementMetrics: "unavailable",
    authorMetrics: "unavailable",
    historicalSearch: "unavailable",
    realTimeSearch: "partial",
    officialApi: "unavailable",
  },
  api: {
    searchPosts: "supported",
    // Neither is actually parsed: the documented ApiItem JSON contract
    // (api-connector.ts) has no engagement field at all, and `author` is
    // a plain string with no follower/verified data — the exact same
    // authorName mechanism RSSConnector uses, correctly rated
    // "unavailable" below for the same reason. "partial" here would be
    // the fabricated-capability claim this table exists to rule out.
    engagementMetrics: "unavailable",
    authorMetrics: "unavailable",
    historicalSearch: "partial",
    realTimeSearch: "supported",
    officialApi: "supported",
  },
  social: {
    searchPosts: "provider_required",
    engagementMetrics: "provider_required",
    authorMetrics: "provider_required",
    historicalSearch: "provider_required",
    realTimeSearch: "provider_required",
    officialApi: "provider_required",
  },
  youtube: {
    searchPosts: "provider_required",
    engagementMetrics: "provider_required",
    authorMetrics: "provider_required",
    historicalSearch: "provider_required",
    realTimeSearch: "provider_required",
    officialApi: "provider_required",
  },
  podcast: {
    searchPosts: "provider_required",
    engagementMetrics: "unavailable",
    authorMetrics: "unavailable",
    historicalSearch: "provider_required",
    realTimeSearch: "provider_required",
    officialApi: "provider_required",
  },
  broadcast: {
    searchPosts: "provider_required",
    engagementMetrics: "unavailable",
    authorMetrics: "unavailable",
    historicalSearch: "provider_required",
    realTimeSearch: "provider_required",
    officialApi: "provider_required",
  },
  custom: {
    searchPosts: "unavailable",
    engagementMetrics: "unavailable",
    authorMetrics: "unavailable",
    historicalSearch: "unavailable",
    realTimeSearch: "unavailable",
    officialApi: "unavailable",
  },
};

const UNKNOWN_CONNECTOR_CAPABILITIES: ConnectorCapabilities = {
  searchPosts: "unavailable",
  engagementMetrics: "unavailable",
  authorMetrics: "unavailable",
  historicalSearch: "unavailable",
  realTimeSearch: "unavailable",
  officialApi: "unavailable",
};

/** A connector name this table doesn't recognize reports every capability `unavailable` — never a guess. */
export function getConnectorCapabilities(connector: string): ConnectorCapabilities {
  return CONNECTOR_CAPABILITIES[connector] ?? UNKNOWN_CONNECTOR_CAPABILITIES;
}
