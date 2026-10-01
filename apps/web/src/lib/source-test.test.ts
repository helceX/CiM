import { beforeEach, describe, expect, it, vi } from "vitest";

const safeFetch = vi.fn();
vi.mock("server-only", () => ({}));
// Everything real except the network: a private-IP URL goes through the real
// SSRF guard (which rejects before any connection), other URLs are stubbed.
vi.mock("@cim/ingestion", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cim/ingestion")>();
  return {
    ...actual,
    safeFetch: (url: string, ...rest: unknown[]) =>
      url.includes("//10.0.0.1/")
        ? (actual.safeFetch as (...a: unknown[]) => unknown)(url, ...rest)
        : safeFetch(url, ...rest),
  };
});

const { testSourceUrl } = await import("./source-test");

const rss = `<?xml version="1.0"?><rss version="2.0"><channel><title>T</title>
<item><title>First</title><link>https://example.com/a</link></item>
<item><title>Second</title><link>https://example.com/b</link></item></channel></rss>`;
const sitemap = `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>https://example.com/a</loc></url></urlset>`;

beforeEach(() => safeFetch.mockReset());

describe("testSourceUrl", () => {
  it("counts feed items and samples titles", async () => {
    safeFetch.mockResolvedValue({ status: 200, body: rss });
    expect(await testSourceUrl("https://example.com/rss", "rss")).toEqual({
      ok: true,
      itemCount: 2,
      sampleTitles: ["First", "Second"],
    });
  });

  it("rejects an empty feed, an HTTP error and a non-feed page", async () => {
    safeFetch.mockResolvedValueOnce({ status: 200, body: `<rss><channel></channel></rss>` });
    expect((await testSourceUrl("https://example.com/rss", "rss")).ok).toBe(false);
    safeFetch.mockResolvedValueOnce({ status: 404, body: "" });
    expect(await testSourceUrl("https://example.com/rss", "rss")).toMatchObject({ ok: false });
    safeFetch.mockResolvedValueOnce({ status: 200, body: "<html><body>hi</body></html>" });
    expect((await testSourceUrl("https://example.com/rss", "rss")).ok).toBe(false);
  });

  it("reads sitemaps", async () => {
    safeFetch.mockResolvedValue({ status: 200, body: sitemap });
    expect(await testSourceUrl("https://example.com/sitemap.xml", "sitemap")).toMatchObject({
      ok: true,
      itemCount: 1,
    });
  });

  it("reports blocked addresses without leaking the resolver detail", async () => {
    expect(await testSourceUrl("https://10.0.0.1/rss", "rss")).toEqual({
      ok: false,
      message: "That address is not allowed.",
    });
    expect(safeFetch).not.toHaveBeenCalled();
  });
});
