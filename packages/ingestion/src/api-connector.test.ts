import { describe, expect, it, vi } from "vitest";
import type { Source } from "@cim/db/schema";
import { SsrfBlockedError, type SafeFetchResult } from "./safe-fetch";

/** Same layering rationale as rss-connector.test.ts. */
const safeFetchMock =
  vi.fn<(url: string, options?: unknown) => Promise<SafeFetchResult>>();
vi.mock("./safe-fetch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./safe-fetch")>();
  return {
    ...actual,
    safeFetch: (...args: Parameters<typeof safeFetchMock>) => safeFetchMock(...args),
  };
});

const { APIConnector } = await import("./api-connector");

function fakeSource(overrides: Partial<Source> = {}): Source {
  return {
    id: "44444444-4444-4444-4444-444444444444",
    name: "Test API Wire",
    domain: "cim-test.invalid",
    country: null,
    language: "en",
    type: "news",
    connector: "api",
    status: "healthy",
    lastCheckedAt: null,
    url: "https://cim-test.invalid/api/articles",
    apiKeyHeaderName: null,
    apiKey: null,
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
  return {
    status: 200,
    headers: new Headers() as never,
    body: "",
    finalUrl: "",
    ...overrides,
  };
}

const API_BODY = JSON.stringify({
  items: [
    {
      id: "item-1",
      title: "Item one",
      url: "https://cim-test.invalid/articles/1",
      publishedAt: "2026-09-21T10:00:00Z",
      content: "Body one.",
      author: "Ada Reporter",
      language: "en",
    },
  ],
});

describe("APIConnector", () => {
  it("fetches and maps API items to RawFetchResult", async () => {
    safeFetchMock.mockResolvedValueOnce(fetchResult({ body: API_BODY }));
    const items = await new APIConnector().fetch(fakeSource());
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      externalId: "item-1",
      canonicalUrl: "https://cim-test.invalid/articles/1",
      title: "Item one",
      bodyText: "Body one.",
      authorName: "Ada Reporter",
      language: "en",
    });
    expect(items[0]?.publishedAt).toEqual(new Date("2026-09-21T10:00:00Z"));
  });

  it("sends no Authorization header when no API key is configured", async () => {
    safeFetchMock.mockResolvedValueOnce(fetchResult({ body: API_BODY }));
    await new APIConnector().fetch(fakeSource());
    const [, options] = safeFetchMock.mock.calls[0] as [
      string,
      { headers: Record<string, string> },
    ];
    expect(options.headers).toEqual({});
  });

  it("sends a Bearer Authorization header by default when an API key is configured", async () => {
    safeFetchMock.mockResolvedValueOnce(fetchResult({ body: API_BODY }));
    await new APIConnector().fetch(fakeSource({ apiKey: "secret-key-1" }));
    const [, options] = safeFetchMock.mock.calls[0] as [
      string,
      { headers: Record<string, string> },
    ];
    expect(options.headers).toEqual({ Authorization: "Bearer secret-key-1" });
  });

  it("sends the raw key under a custom header name when configured", async () => {
    safeFetchMock.mockResolvedValueOnce(fetchResult({ body: API_BODY }));
    await new APIConnector().fetch(
      fakeSource({ apiKey: "secret-key-2", apiKeyHeaderName: "X-Api-Key" }),
    );
    const [, options] = safeFetchMock.mock.calls[0] as [
      string,
      { headers: Record<string, string> },
    ];
    expect(options.headers).toEqual({ "X-Api-Key": "secret-key-2" });
  });

  it("drops items with no url rather than failing the whole fetch", async () => {
    safeFetchMock.mockResolvedValueOnce(
      fetchResult({
        body: JSON.stringify({
          items: [
            { id: "no-url", title: "Missing URL" },
            ...JSON.parse(API_BODY).items,
          ],
        }),
      }),
    );
    const items = await new APIConnector().fetch(fakeSource());
    expect(items).toHaveLength(1);
    expect(items[0]?.externalId).toBe("item-1");
  });

  it("falls back to (untitled) for an item missing a title", async () => {
    safeFetchMock.mockResolvedValueOnce(
      fetchResult({
        body: JSON.stringify({
          items: [{ url: "https://cim-test.invalid/articles/2" }],
        }),
      }),
    );
    const items = await new APIConnector().fetch(fakeSource());
    expect(items[0]?.title).toBe("(untitled)");
    expect(items[0]?.bodyText).toBe("");
  });

  it("throws fetching a source with no API endpoint configured, without calling safeFetch", async () => {
    safeFetchMock.mockClear();
    await expect(new APIConnector().fetch(fakeSource({ url: null }))).rejects.toThrow(
      /no API endpoint/i,
    );
    expect(safeFetchMock).not.toHaveBeenCalled();
  });

  it("throws on a non-2xx response", async () => {
    safeFetchMock.mockResolvedValueOnce(fetchResult({ status: 500 }));
    await expect(new APIConnector().fetch(fakeSource())).rejects.toThrow(/HTTP 500/);
  });

  it("healthCheck reports unavailable when no URL is configured", async () => {
    const health = await new APIConnector().healthCheck(fakeSource({ url: null }));
    expect(health.status).toBe("unavailable");
  });

  it("healthCheck reports blocked when safeFetch raises SsrfBlockedError", async () => {
    safeFetchMock.mockRejectedValueOnce(new SsrfBlockedError("blocked for test"));
    const health = await new APIConnector().healthCheck(fakeSource());
    expect(health.status).toBe("blocked");
  });

  it("healthCheck reports blocked (not just error) on a 401, hinting at the configured key", async () => {
    safeFetchMock.mockResolvedValueOnce(fetchResult({ status: 401 }));
    const health = await new APIConnector().healthCheck(fakeSource());
    expect(health.status).toBe("blocked");
    expect(health.message).toMatch(/key/i);
  });

  it("healthCheck reports error on a non-auth non-2xx response", async () => {
    safeFetchMock.mockResolvedValueOnce(fetchResult({ status: 500 }));
    const health = await new APIConnector().healthCheck(fakeSource());
    expect(health.status).toBe("error");
  });

  it("healthCheck reports error on unparseable JSON", async () => {
    safeFetchMock.mockResolvedValueOnce(
      fetchResult({ status: 200, body: "not json at all" }),
    );
    const health = await new APIConnector().healthCheck(fakeSource());
    expect(health.status).toBe("error");
  });

  it("healthCheck reports healthy for a valid response", async () => {
    safeFetchMock.mockResolvedValueOnce(fetchResult({ status: 200, body: API_BODY }));
    const health = await new APIConnector().healthCheck(fakeSource());
    expect(health.status).toBe("healthy");
  });
});
