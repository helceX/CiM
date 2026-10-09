import type { Source } from "@cim/db/schema";
import { parseRetryAfter } from "@cim/core";
import type { HealthHints, RawFetchResult, SourceConnector, SourceHealth } from "./connector";
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

/** What the connector reaches the internet with. Production passes nothing; tests and the benchmark pass fakes. */
export type RSSConnectorDeps = {
  fetcher?: typeof safeFetch;
  robotsBlocked?: (url: string) => Promise<boolean>;
};

export class RSSConnector implements SourceConnector {
  private readonly fetcher: typeof safeFetch;
  private readonly robotsBlocked: (url: string) => Promise<boolean>;

  constructor(deps: RSSConnectorDeps = {}) {
    this.fetcher = deps.fetcher ?? safeFetch;
    this.robotsBlocked = deps.robotsBlocked ?? isExplicitlyBlockedByRobots;
  }

  async fetch(source: Source): Promise<RawFetchResult[]> {
    if (!source.url) throw new Error(`Source "${source.name}" has no feed URL configured`);
    let body = takeRecentBody(source.url);
    if (body === null) {
      if (await this.robotsBlocked(source.url)) {
        throw new Error(`robots.txt asks Mediaory-Bot not to fetch ${source.url}`);
      }
      body = (await this.fetcher(source.url)).body;
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

  async healthCheck(source: Source, hints: HealthHints = {}): Promise<SourceHealth> {
    if (!source.url) return { status: "unavailable", message: "No feed URL configured" };
    try {
      if (await this.robotsBlocked(source.url)) {
        return { status: "blocked", message: "robots.txt asks Mediaory-Bot not to fetch this feed" };
      }
      // Ask "has it changed?" when the last crawl kept the publisher's version: a 304 costs the publisher nothing and
      // costs us no download, no parse and no database work.
      const conditional: Record<string, string> = {};
      if (hints.validators?.etag) conditional["if-none-match"] = hints.validators.etag;
      if (hints.validators?.lastModified) conditional["if-modified-since"] = hints.validators.lastModified;
      const { status, body, headers } = await this.fetcher(source.url, { timeoutMs: 8000, headers: conditional });
      if (status === 304) return { status: "healthy", notModified: true };
      if (status >= 400) {
        return { status: "error", message: `Feed responded HTTP ${status}`, retryAfterMs: parseRetryAfter(headers?.get("retry-after")) ?? undefined };
      }
      parseFeed(body);
      rememberBody(source.url, body);
      const etag = headers?.get("etag") ?? undefined;
      const lastModified = headers?.get("last-modified") ?? undefined;
      return { status: "healthy", validators: etag || lastModified ? { etag, lastModified } : undefined };
    } catch (error) {
      if (error instanceof SsrfBlockedError) return { status: "blocked", message: error.message };
      return { status: "error", message: error instanceof Error ? error.message : String(error) };
    }
  }
}
