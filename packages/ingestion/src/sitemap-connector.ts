import type { Source } from "@cim/db/schema";
import type { RawFetchResult, SourceConnector, SourceHealth } from "./connector";
import { extractTitle, htmlToPlainText } from "./html-text";
import { isAllowedByRobotsTxt } from "./robots";
import { safeFetch, SsrfBlockedError } from "./safe-fetch";
import { parseSitemap, type SitemapUrl } from "./sitemap-parse";

// Bounds cost per crawl tick — a real sitemap can list thousands of URLs;
// fetching and parsing each one is real work, not free. Newest-first via
// lastmod keeps the pages most likely to be genuinely new.
const MAX_PAGES_PER_CRAWL = 10;
// A <sitemapindex> can itself point at more sitemapindexes; one level of
// nesting covers the common "index of per-year sitemaps" case without an
// unbounded recursive fetch.
const MAX_INDEX_DEPTH = 1;

/**
 * docs/architecture/INGESTION.md `SitemapConnector` — a sitemap only
 * lists URLs, so producing a `RawFetchResult` per entry means fetching
 * each page too. Respects robots.txt per page (the sitemap.xml fetch
 * itself is exempt — sites publish it to be crawled, often naming it in
 * their own robots.txt via `Sitemap:`).
 */
export class SitemapConnector implements SourceConnector {
  async fetch(source: Source): Promise<RawFetchResult[]> {
    if (!source.url) throw new Error(`Source "${source.name}" has no sitemap URL configured`);

    const urls = await this.collectUrls(source.url, MAX_INDEX_DEPTH);
    const newestFirst = [...urls].sort((a, b) => (b.lastmod?.getTime() ?? 0) - (a.lastmod?.getTime() ?? 0));
    const candidates = newestFirst.slice(0, MAX_PAGES_PER_CRAWL);

    const results: RawFetchResult[] = [];
    for (const entry of candidates) {
      if (!entry.loc) continue;
      // One page's failure (robots-blocked, unreachable, unparseable)
      // never fails the whole sitemap crawl — same "one source's failure
      // is isolated" principle INGESTION.md applies across sources,
      // applied here across this source's own pages.
      try {
        const allowed = await isAllowedByRobotsTxt(entry.loc);
        if (!allowed) continue;
        const { body } = await safeFetch(entry.loc);
        results.push({
          externalId: entry.loc,
          canonicalUrl: entry.loc,
          title: extractTitle(body) ?? entry.loc,
          bodyText: htmlToPlainText(body),
          language: source.language,
          publishedAt: entry.lastmod,
          authorName: null,
        });
      } catch {
        continue;
      }
    }
    return results;
  }

  private async collectUrls(sitemapUrl: string, depthRemaining: number): Promise<SitemapUrl[]> {
    const { body } = await safeFetch(sitemapUrl);
    const parsed = parseSitemap(body);
    if (parsed.kind === "urlset") return parsed.urls;
    if (depthRemaining <= 0) return [];
    const nested = await Promise.all(
      parsed.sitemaps
        .slice(0, MAX_PAGES_PER_CRAWL)
        .map((loc) => this.collectUrls(loc, depthRemaining - 1).catch(() => [])),
    );
    return nested.flat();
  }

  async healthCheck(source: Source): Promise<SourceHealth> {
    if (!source.url) return { status: "unavailable", message: "No sitemap URL configured" };
    try {
      const { status, body } = await safeFetch(source.url, { timeoutMs: 8000 });
      if (status >= 400) return { status: "error", message: `Sitemap responded HTTP ${status}` };
      parseSitemap(body);
      return { status: "healthy" };
    } catch (error) {
      if (error instanceof SsrfBlockedError) return { status: "blocked", message: error.message };
      return { status: "error", message: error instanceof Error ? error.message : String(error) };
    }
  }
}
