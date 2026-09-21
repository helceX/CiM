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

const { WebConnector } = await import("./web-connector");

function fakeSource(overrides: Partial<Source> = {}): Source {
  return {
    id: "33333333-3333-3333-3333-333333333333",
    name: "Test Newsroom Page",
    domain: "cim-test.invalid",
    country: null,
    language: "en",
    type: "website",
    connector: "web",
    status: "healthy",
    lastCheckedAt: null,
    url: "https://cim-test.invalid/newsroom",
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

const PAGE_HTML = `<html><head><title>Company Newsroom</title></head><body><p>Latest updates.</p></body></html>`;

describe("WebConnector", () => {
  it("fetches and extracts title + plain text", async () => {
    robotsMock.mockResolvedValueOnce(true);
    safeFetchMock.mockResolvedValueOnce(fetchResult({ body: PAGE_HTML }));
    const items = await new WebConnector().fetch(fakeSource());
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      externalId: "https://cim-test.invalid/newsroom",
      canonicalUrl: "https://cim-test.invalid/newsroom",
      title: "Company Newsroom",
      bodyText: "Latest updates.",
    });
  });

  it("returns no items when robots.txt disallows the page", async () => {
    robotsMock.mockResolvedValueOnce(false);
    const items = await new WebConnector().fetch(fakeSource());
    expect(items).toHaveLength(0);
    expect(safeFetchMock).not.toHaveBeenCalled();
  });

  it("throws fetching a source with no page URL configured", async () => {
    await expect(new WebConnector().fetch(fakeSource({ url: null }))).rejects.toThrow(/no page URL/i);
  });

  it("healthCheck reports blocked when safeFetch raises SsrfBlockedError", async () => {
    safeFetchMock.mockRejectedValueOnce(new SsrfBlockedError("blocked for test"));
    const health = await new WebConnector().healthCheck(fakeSource());
    expect(health.status).toBe("blocked");
  });

  it("healthCheck reports error on a non-2xx response", async () => {
    safeFetchMock.mockResolvedValueOnce(fetchResult({ status: 404 }));
    const health = await new WebConnector().healthCheck(fakeSource());
    expect(health.status).toBe("error");
  });

  it("healthCheck reports healthy for a reachable page", async () => {
    safeFetchMock.mockResolvedValueOnce(fetchResult({ status: 200 }));
    const health = await new WebConnector().healthCheck(fakeSource());
    expect(health.status).toBe("healthy");
  });
});
