import { describe, expect, it } from "vitest";
import { parseSitemap } from "./sitemap-parse";

const URLSET = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/a</loc><lastmod>2026-09-20</lastmod></url>
  <url><loc>https://example.com/b</loc><lastmod>2026-09-21T10:00:00Z</lastmod></url>
</urlset>`;

const URLSET_SINGLE = `<urlset><url><loc>https://example.com/only</loc></url></urlset>`;

const SITEMAP_INDEX = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>https://example.com/sitemap-1.xml</loc></sitemap>
  <sitemap><loc>https://example.com/sitemap-2.xml</loc></sitemap>
</sitemapindex>`;

describe("parseSitemap", () => {
  it("parses a urlset with multiple entries", () => {
    const result = parseSitemap(URLSET);
    expect(result.kind).toBe("urlset");
    if (result.kind !== "urlset") throw new Error("unreachable");
    expect(result.urls).toHaveLength(2);
    expect(result.urls[0]!.loc).toBe("https://example.com/a");
    expect(result.urls[0]!.lastmod).toBeInstanceOf(Date);
    expect(result.urls[1]!.lastmod?.toISOString()).toBe("2026-09-21T10:00:00.000Z");
  });

  it("returns an array for a urlset with exactly one entry", () => {
    const result = parseSitemap(URLSET_SINGLE);
    if (result.kind !== "urlset") throw new Error("unreachable");
    expect(result.urls).toHaveLength(1);
  });

  it("parses a sitemapindex", () => {
    const result = parseSitemap(SITEMAP_INDEX);
    expect(result.kind).toBe("sitemapindex");
    if (result.kind !== "sitemapindex") throw new Error("unreachable");
    expect(result.sitemaps).toEqual([
      "https://example.com/sitemap-1.xml",
      "https://example.com/sitemap-2.xml",
    ]);
  });

  it("throws on an unrecognized document shape", () => {
    expect(() => parseSitemap("<not-a-sitemap/>")).toThrow(/[Uu]nrecognized sitemap/);
  });
});
