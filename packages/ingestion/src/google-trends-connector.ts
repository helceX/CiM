import { createHash } from "node:crypto";
import {
  allowedGoogleTrendsGeographies,
  isGoogleTrendsEnabled,
  parseGoogleTrendsFeedGeo,
  type CoverageEnvironment,
} from "@cim/core";
import type { Source } from "@cim/db/schema";
import type { HealthHints, RawFetchResult, SourceConnector, SourceHealth } from "./connector";
import { RSSConnector, type RSSConnectorDeps } from "./rss-connector";

export type GoogleTrendsConnectorDeps = RSSConnectorDeps & {
  environment?: CoverageEnvironment;
  now?: () => Date;
};

/**
 * Geo-only Trends RSS ingestion. Both feature flags and the exact geo URL are
 * checked before any network call. Items are daily synthetic records; no
 * traffic estimates or tenant query terms are stored.
 */
export class GoogleTrendsConnector implements SourceConnector {
  private readonly rss: RSSConnector;
  private readonly environment: CoverageEnvironment;
  private readonly now: () => Date;

  constructor(deps: GoogleTrendsConnectorDeps = {}) {
    this.rss = new RSSConnector(deps);
    this.environment = deps.environment ?? process.env;
    this.now = deps.now ?? (() => new Date());
  }

  private geo(source: Source): string | null {
    if (!isGoogleTrendsEnabled(this.environment)) return null;
    return source.url
      ? parseGoogleTrendsFeedGeo(source.url, allowedGoogleTrendsGeographies(this.environment))
      : null;
  }

  async healthCheck(source: Source, hints: HealthHints = {}): Promise<SourceHealth> {
    if (!isGoogleTrendsEnabled(this.environment)) {
      return { status: "unavailable", message: "Google Trends RSS is disabled by configuration" };
    }
    if (!this.geo(source)) return { status: "unavailable", message: "Google Trends feed URL is not allowlisted" };
    return this.rss.healthCheck(source, hints);
  }

  async fetch(source: Source): Promise<RawFetchResult[]> {
    const geo = this.geo(source);
    if (!geo) throw new Error("Google Trends RSS is disabled or the feed geography is not allowlisted");
    const day = this.now().toISOString().slice(0, 10);
    const entries = await this.rss.fetch(source);
    return entries.map((entry) => {
      const digest = createHash("sha256").update(`${geo}\n${day}\n${entry.title.trim().toLocaleLowerCase("tr")}`).digest("hex").slice(0, 32);
      const canonicalUrl = `https://trends.google.com/trends/explore?date=${day}&geo=${geo}&q=${encodeURIComponent(entry.title)}`;
      return {
        ...entry,
        externalId: `google-trends:${geo}:${day}:${digest}`,
        canonicalUrl,
        // Google may include approximate search-volume buckets in the RSS body;
        // retain only the trend label and publisher link, never those estimates.
        bodyText: `Google Trends listing for ${geo} on ${day}.`,
        publishedAt: entry.publishedAt ?? new Date(`${day}T00:00:00.000Z`),
        authorName: null,
      };
    });
  }
}
