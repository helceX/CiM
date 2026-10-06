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
/**
 * A crawl runs healthCheck and then fetch back to back; the health check already downloaded the
 * feed, so its body is kept for a couple of minutes and fetch uses it once instead of asking the
 * publisher a second time.
 */
const RECENT_BODY_MS = 2 * 60_000;
const RECENT_BODY_MAX = 200;
const recentBodies = new Map<string, { at: number; body: string }>();

function rememberBody(url: string, body: string): void {
  if (recentBodies.size >= RECENT_BODY_MAX) recentBodies.clear();
  recentBodies.set(url, { at: Date.now(), body });
}

function takeRecentBody(url: string): string | null {
  const hit = recentBodies.get(url);
  recentBodies.delete(url);
  return hit && Date.now() - hit.at < RECENT_BODY_MS ? hit.body : null;
}

export class RSSConnector implements SourceConnector {
  async fetch(source: Source): Promise<RawFetchResult[]> {
    if (!source.url) throw new Error(`Source "${source.name}" has no feed URL configured`);
    let body = takeRecentBody(source.url);
    if (body === null) {
      if (await isExplicitlyBlockedByRobots(source.url)) {
        throw new Error(`robots.txt asks Mediaory-Bot not to fetch ${source.url}`);
      }
      body = (await safeFetch(source.url)).body;
    }
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
      rememberBody(source.url, body);
      return { status: "healthy" };
    } catch (error) {
      if (error instanceof SsrfBlockedError) return { status: "blocked", message: error.message };
      return { status: "error", message: error instanceof Error ? error.message : String(error) };
    }
  }
}
