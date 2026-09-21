import { describe, expect, it, vi } from "vitest";
import type { Source } from "@cim/db/schema";
import { SsrfBlockedError, type SafeFetchResult } from "./safe-fetch";

/** Same layering rationale as rss-connector.test.ts. */
const safeFetchMock = vi.fn<(url: string, options?: unknown) => Promise<SafeFetchResult>>();
vi.mock("./safe-fetch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./safe-fetch")>();
  return { ...actual, safeFetch: (...args: Parameters<typeof safeFetchMock>) => safeFetchMock(...args) };
});

const robotsMock = vi.fn<(url: string) => Promise<boolean>>();
vi.mock("./robots", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./robots")>();
  return { ...actual, isAllowedByRobotsTxt: (...args: Parameters<typeof robotsMock>) => robotsMock(...args) };
});

const { SitemapConnector } = await import("./sitemap-connector");

function fakeSource(overrides: Partial<Source> = {}): Source {
  return {
    id: "22222222-2222-2222-2222-222222222222",
    name: "Test Sitemap Site",
    domain: "cim-test.invalid",
    country: null,
    language: "en",
    type: "website",
    connector: "sitemap",
    status: "healthy",
    lastCheckedAt: null,
    url: "https://cim-test.invalid/sitemap.xml",
    canStoreFullText: false,
    canDisplayFullText: false,
    canDisplayExcerpt: true,
    canStoreMedia: false,
    canProcessAi: true,
    license: null,
    termsUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function fetchResult(overrides: Partial<SafeFetchResult> = {}): SafeFetchResult {
  return { status: 200, headers: new Headers() as never, body: "", finalUrl: "", ...overrides };
}

const URLSET = `<urlset>
  <url><loc>https://cim-test.invalid/a</loc><lastmod>2026-09-20</lastmod></url>
  <url><loc>https://cim-test.invalid/b</loc><lastmod>2026-09-21</lastmod></url>
</urlset>`;

const SITEMAP_INDEX = `<sitemapindex>
  <sitemap><loc>https://cim-test.invalid/sitemap-1.xml</loc></sitemap>
</sitemapindex>`;

const PAGE_HTML = (title: string) => `<html><head><title>${title}</title></head><body><p>Body of ${title}.</p></body></html>`;

describe("SitemapConnector", () => {
  it("fetches the sitemap, then each page, newest first", async () => {
    robotsMock.mockResolvedValue(true);
    safeFetchMock
      .mockResolvedValueOnce(fetchResult({ body: URLSET })) // sitemap.xml
      .mockResolvedValueOnce(fetchResult({ body: PAGE_HTML("B") })) // /b (newer lastmod, fetched first)
      .mockResolvedValueOnce(fetchResult({ body: PAGE_HTML("A") })); // /a

    const items = await new SitemapConnector().fetch(fakeSource());
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ canonicalUrl: "https://cim-test.invalid/b", title: "B" });
    expect(items[1]).toMatchObject({ canonicalUrl: "https://cim-test.invalid/a", title: "A" });
  });

  it("follows one level of sitemapindex nesting", async () => {
    robotsMock.mockResolvedValue(true);
    safeFetchMock
      .mockResolvedValueOnce(fetchResult({ body: SITEMAP_INDEX })) // sitemap.xml -> index
      .mockResolvedValueOnce(fetchResult({ body: URLSET })) // sitemap-1.xml -> urlset
      .mockResolvedValueOnce(fetchResult({ body: PAGE_HTML("B") }))
      .mockResolvedValueOnce(fetchResult({ body: PAGE_HTML("A") }));

    const items = await new SitemapConnector().fetch(fakeSource());
    expect(items).toHaveLength(2);
  });

  it("skips a page robots.txt disallows, without failing the whole crawl", async () => {
    robotsMock.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    safeFetchMock
      .mockResolvedValueOnce(fetchResult({ body: URLSET }))
      .mockResolvedValueOnce(fetchResult({ body: PAGE_HTML("A") }));

    const items = await new SitemapConnector().fetch(fakeSource());
    expect(items).toHaveLength(1);
    expect(items[0]!.title).toBe("A");
  });

  it("skips a page that fails to fetch, without failing the whole crawl", async () => {
    robotsMock.mockResolvedValue(true);
    safeFetchMock
      .mockResolvedValueOnce(fetchResult({ body: URLSET }))
      .mockRejectedValueOnce(new Error("connection reset"))
      .mockResolvedValueOnce(fetchResult({ body: PAGE_HTML("A") }));

    const items = await new SitemapConnector().fetch(fakeSource());
    expect(items).toHaveLength(1);
  });

  it("throws fetching a source with no sitemap URL configured", async () => {
    await expect(new SitemapConnector().fetch(fakeSource({ url: null }))).rejects.toThrow(/no sitemap URL/i);
  });

  it("healthCheck reports blocked when safeFetch raises SsrfBlockedError", async () => {
    safeFetchMock.mockRejectedValueOnce(new SsrfBlockedError("blocked for test"));
    const health = await new SitemapConnector().healthCheck(fakeSource());
    expect(health.status).toBe("blocked");
  });

  it("healthCheck reports healthy for a valid sitemap", async () => {
    safeFetchMock.mockResolvedValueOnce(fetchResult({ body: URLSET }));
    const health = await new SitemapConnector().healthCheck(fakeSource());
    expect(health.status).toBe("healthy");
  });
});
