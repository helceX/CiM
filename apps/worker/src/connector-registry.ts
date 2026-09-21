import { MockNewsConnector, type SourceConnector } from "@cim/ingestion";

/**
 * docs/architecture/INGESTION.md — connector implementations register
 * here by the `Source.connector` value. RSS/Sitemap/Web/API/Social/etc.
 * are added as they ship (Phase 2+); a Source configured for a connector
 * that isn't implemented yet is reported `unavailable` by the crawl job
 * rather than silently doing nothing or fabricating data (brief §32).
 */
const registry: Record<string, SourceConnector> = {
  mock: new MockNewsConnector(),
};

export function getConnectorFor(connectorName: string): SourceConnector | undefined {
  return registry[connectorName];
}
