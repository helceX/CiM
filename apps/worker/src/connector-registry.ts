import {
  MockNewsConnector,
  RSSConnector,
  SitemapConnector,
  WebConnector,
  type SourceConnector,
} from "@cim/ingestion";

/**
 * docs/architecture/INGESTION.md — connector implementations register
 * here by the `Source.connector` value. API/Social/YouTube/Podcast/
 * Broadcast/Custom are Phase 3+; a Source configured for a connector
 * that isn't implemented yet is reported `unavailable` by the crawl job
 * rather than silently doing nothing or fabricating data (brief §32).
 */
const registry: Record<string, SourceConnector> = {
  mock: new MockNewsConnector(),
  rss: new RSSConnector(),
  sitemap: new SitemapConnector(),
  web: new WebConnector(),
};

export function getConnectorFor(connectorName: string): SourceConnector | undefined {
  return registry[connectorName];
}
