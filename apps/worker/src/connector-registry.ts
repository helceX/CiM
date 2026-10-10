import {
  APIConnector,
  GoogleTrendsConnector,
  MockNewsConnector,
  MockSocialConnector,
  RSSConnector,
  SitemapConnector,
  WebConnector,
  type SourceConnector,
} from "@cim/ingestion";

/**
 * docs/architecture/INGESTION.md — connector implementations register
 * here by the `Source.connector` value. YouTube/Podcast/Broadcast/Custom
 * and the real platform-specific social connectors (X/Instagram/etc.)
 * remain P3+ (docs/product/FEATURE_MATRIX_V2.md); a Source configured
 * for a connector that isn't implemented yet is reported `unavailable`
 * by the crawl job rather than silently doing nothing or fabricating
 * data (brief §32). `mock-social` ships now (Phase 44,
 * ADR-006-SOCIAL-LISTENING.md) as the social counterpart to `mock`.
 */
const registry: Record<string, SourceConnector> = {
  mock: new MockNewsConnector(),
  "mock-social": new MockSocialConnector(),
  rss: new RSSConnector(),
  sitemap: new SitemapConnector(),
  web: new WebConnector(),
  api: new APIConnector(),
  "google-trends": new GoogleTrendsConnector(),
};

export function getConnectorFor(connectorName: string): SourceConnector | undefined {
  return registry[connectorName];
}
