import { parseFeed } from "./feed-parse";
import { parseSitemap } from "./sitemap-parse";
import { safeFetch, SsrfBlockedError } from "./safe-fetch";
import { testApiEndpoint } from "./api-connector";
import {
  allowedGoogleTrendsGeographies,
  isGoogleTrendsEnabled,
  parseGoogleTrendsFeedGeo,
} from "@cim/core";

export type SourceTestResult =
  | { ok: true; itemCount: number; sampleTitles: string[] }
  | { ok: false; message: string };

/**
 * Fetches a candidate feed/sitemap through the same SSRF-guarded client the
 * crawler uses and reports what it found. A source is only saved when this
 * returns ok with at least one item — "the URL exists" is not enough, an empty
 * or non-feed page would just sit in the crawl list failing forever.
 */
export async function testSourceUrl(
  url: string,
  connector: "rss" | "sitemap" | "api" | "google-trends",
  auth: { apiKey?: string; apiKeyHeaderName?: string } = {},
): Promise<SourceTestResult> {
  if (connector === "google-trends") {
    if (!isGoogleTrendsEnabled(process.env)) {
      return { ok: false, message: "Google Trends RSS is disabled by configuration." };
    }
    if (!parseGoogleTrendsFeedGeo(url, allowedGoogleTrendsGeographies(process.env))) {
      return { ok: false, message: "That Google Trends geography is not allowlisted." };
    }
  }
  if (connector === "api") {
    const result = await testApiEndpoint(url, auth);
    return result.ok ? { ok: true, itemCount: result.itemCount, sampleTitles: result.sampleTitles } : result;
  }
  try {
    const { status, body } = await safeFetch(url, { timeoutMs: 8000 });
    if (status >= 400) return { ok: false, message: `The server answered HTTP ${status}.` };
    if (connector === "sitemap") {
      const parsed = parseSitemap(body);
      const count = parsed.kind === "urlset" ? parsed.urls.length : parsed.sitemaps.length;
      if (count === 0) return { ok: false, message: "The sitemap has no URLs." };
      return {
        ok: true,
        itemCount: count,
        sampleTitles: parsed.kind === "urlset" ? parsed.urls.slice(0, 3).map((u) => u.loc) : [],
      };
    }
    const items = parseFeed(body);
    if (items.length === 0) return { ok: false, message: "The feed has no items." };
    return {
      ok: true,
      itemCount: items.length,
      sampleTitles: items
        .slice(0, 3)
        .map((item) => item.title)
        .filter(Boolean),
    };
  } catch (error) {
    if (error instanceof SsrfBlockedError) {
      return { ok: false, message: "That address is not allowed." };
    }
    return {
      ok: false,
      message: error instanceof Error ? `Could not read it: ${error.message}` : "Could not read it.",
    };
  }
}
