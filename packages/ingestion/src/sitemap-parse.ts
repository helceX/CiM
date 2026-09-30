import { XMLParser } from "fast-xml-parser";

export type SitemapUrl = { loc: string; lastmod: Date | null };

const parser = new XMLParser({
  isArray: (name) => name === "url" || name === "sitemap",
});

function textOf(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return "";
}

function parseDate(value: string): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * docs/architecture/INGESTION.md `SitemapConnector`. A sitemap XML
 * document is either a `<urlset>` of pages, or a `<sitemapindex>` of
 * other sitemaps (common for large sites) — the connector is
 * responsible for following a sitemap index (bounded — see
 * sitemap-connector.ts), this function just tells the caller which kind
 * it got.
 */
export type ParsedSitemap = { kind: "urlset"; urls: SitemapUrl[] } | { kind: "sitemapindex"; sitemaps: string[] };

export function parseSitemap(xml: string): ParsedSitemap {
  const doc = parser.parse(xml) as Record<string, unknown>;

  const urlset = doc.urlset as Record<string, unknown> | undefined;
  if (urlset && typeof urlset === "object") {
    const raw = urlset.url;
    const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
    return {
      kind: "urlset",
      urls: list.map((entry) => {
        const url = entry as Record<string, unknown>;
        return { loc: textOf(url.loc), lastmod: parseDate(textOf(url.lastmod)) };
      }),
    };
  }

  const sitemapIndex = doc.sitemapindex as Record<string, unknown> | undefined;
  if (sitemapIndex && typeof sitemapIndex === "object") {
    const raw = sitemapIndex.sitemap;
    const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
    return {
      kind: "sitemapindex",
      sitemaps: list.map((entry) => textOf((entry as Record<string, unknown>).loc)).filter(Boolean),
    };
  }

  throw new Error("Unrecognized sitemap format: expected <urlset> or <sitemapindex>");
}
