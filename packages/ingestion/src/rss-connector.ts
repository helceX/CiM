import type { Source } from "@cim/db/schema";
import type { RawFetchResult, SourceConnector, SourceHealth } from "./connector";
import { parseFeed } from "./feed-parse";
import { isExplicitlyBlockedByRobots } from "./robots";
import { safeFetch, SsrfBlockedError } from "./safe-fetch";

/**
 * docs/architecture/INGESTION.md `RSSConnector`. Feeds are meant to be
 * polled (that's their whole purpose), so — unlike Web/Sitemap — this
 * connector ignores generic robots.txt rules; it honours only a rule that
 * names Mediaory-Bot (see isExplicitlyBlockedByRobots). `safeFetch` still
 * guards every request against SSRF regardless.
 */
export class RSSConnector implements SourceConnector {
  async fetch(source: Source): Promise<RawFetchResult[]> {
    if (!source.url) throw new Error(`Source "${source.name}" has no feed URL configured`);
    if (await isExplicitlyBlockedByRobots(source.url)) {
      throw new Error(`robots.txt asks Mediaory-Bot not to fetch ${source.url}`);
    }
    const { body } = await safeFetch(source.url);
    const items = parseFeed(body);
    return items
      .filter((item) => item.canonicalUrl)
      .map((item) => ({
        externalId: item.externalId || item.canonicalUrl,
        canonicalUrl: item.canonicalUrl,
        title: item.title || "(untitled)",
        bodyText: item.bodyText,
        language: source.language,
        publishedAt: item.publishedAt,
        authorName: item.authorName,
      }));
  }

  async healthCheck(source: Source): Promise<SourceHealth> {
    if (!source.url) return { status: "unavailable", message: "No feed URL configured" };
    try {
      if (await isExplicitlyBlockedByRobots(source.url)) {
        return { status: "blocked", message: "robots.txt asks Mediaory-Bot not to fetch this feed" };
      }
      const { status, body } = await safeFetch(source.url, { timeoutMs: 8000 });
      if (status >= 400) return { status: "error", message: `Feed responded HTTP ${status}` };
      parseFeed(body);
      return { status: "healthy" };
    } catch (error) {
      if (error instanceof SsrfBlockedError) return { status: "blocked", message: error.message };
      return { status: "error", message: error instanceof Error ? error.message : String(error) };
    }
  }
}
