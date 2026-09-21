import { describe, expect, it, vi } from "vitest";
import type { Source } from "@cim/db/schema";
import { SsrfBlockedError, type SafeFetchResult } from "./safe-fetch";

/**
 * The SSRF guard and the raw HTTP/XML plumbing are already exhaustively
 * covered by ssrf-guard.test.ts, safe-fetch.test.ts, and
 * feed-parse.test.ts — real local-server tests there. Re-proving "a real
 * network fetch works" here would need a target the guard is *supposed*
 * to reject (everything reachable from this sandbox is loopback/private),
 * so instead `safeFetch` is mocked and these tests cover what's actually
 * this connector's own responsibility: mapping feed items to
 * RawFetchResult, and classifying health-check outcomes.
 */
const safeFetchMock = vi.fn<(url: string, options?: unknown) => Promise<SafeFetchResult>>();
vi.mock("./safe-fetch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./safe-fetch")>();
  return { ...actual, safeFetch: (...args: Parameters<typeof safeFetchMock>) => safeFetchMock(...args) };
});

const { RSSConnector } = await import("./rss-connector");

function fakeSource(overrides: Partial<Source> = {}): Source {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    name: "Test Feed",
    domain: "cim-test.invalid",
    country: null,
    language: "en",
    type: "news",
    connector: "rss",
    status: "healthy",
    lastCheckedAt: null,
    url: "https://cim-test.invalid/feed.xml",
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

const FEED_XML = `<rss version="2.0"><channel><title>Feed</title>
  <item>
    <title>Item one</title>
    <link>https://cim-test.invalid/articles/1</link>
    <guid>item-1</guid>
    <pubDate>Mon, 21 Sep 2026 10:00:00 GMT</pubDate>
    <description>Body one.</description>
  </item>
</channel></rss>`;

describe("RSSConnector", () => {
  it("fetches and maps feed items to RawFetchResult", async () => {
    safeFetchMock.mockResolvedValueOnce(fetchResult({ body: FEED_XML }));
    const items = await new RSSConnector().fetch(fakeSource());
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      externalId: "item-1",
      canonicalUrl: "https://cim-test.invalid/articles/1",
      title: "Item one",
      bodyText: "Body one.",
    });
    expect(safeFetchMock).toHaveBeenCalledWith("https://cim-test.invalid/feed.xml");
  });

  it("throws fetching a source with no feed URL configured, without calling safeFetch", async () => {
    safeFetchMock.mockClear();
    await expect(new RSSConnector().fetch(fakeSource({ url: null }))).rejects.toThrow(/no feed URL/i);
    expect(safeFetchMock).not.toHaveBeenCalled();
  });

  it("healthCheck reports unavailable when no URL is configured", async () => {
    const health = await new RSSConnector().healthCheck(fakeSource({ url: null }));
    expect(health.status).toBe("unavailable");
  });

  it("healthCheck reports blocked when safeFetch raises SsrfBlockedError", async () => {
    safeFetchMock.mockRejectedValueOnce(new SsrfBlockedError("blocked for test"));
    const health = await new RSSConnector().healthCheck(fakeSource());
    expect(health.status).toBe("blocked");
  });

  it("healthCheck reports error on a non-2xx response", async () => {
    safeFetchMock.mockResolvedValueOnce(fetchResult({ status: 500 }));
    const health = await new RSSConnector().healthCheck(fakeSource());
    expect(health.status).toBe("error");
  });

  it("healthCheck reports error on unparseable XML", async () => {
    safeFetchMock.mockResolvedValueOnce(fetchResult({ status: 200, body: "not xml at all" }));
    const health = await new RSSConnector().healthCheck(fakeSource());
    expect(health.status).toBe("error");
  });

  it("healthCheck reports healthy for a valid feed", async () => {
    safeFetchMock.mockResolvedValueOnce(fetchResult({ status: 200, body: FEED_XML }));
    const health = await new RSSConnector().healthCheck(fakeSource());
    expect(health.status).toBe("healthy");
  });
});
