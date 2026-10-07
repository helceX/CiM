import { describe, expect, it, vi } from "vitest";
import { advertisedFeeds, discoverFeed } from "./feed-discovery";

const ok = { ok: true as const, itemCount: 5, sampleTitles: ["a"] };
const bad = { ok: false as const, message: "no" };
const page = (body: string, status = 200) => async () => ({ status, body, finalUrl: "https://startup.example/" });

describe("advertisedFeeds", () => {
  it("reads rss and atom alternates, resolves relative links, ignores other link tags", () => {
    const html = `<head>
      <link rel="stylesheet" href="/a.css">
      <link rel="alternate" type="application/rss+xml" title="x" href="/feed.xml">
      <link href='https://other.example/atom' type='application/atom+xml' rel='alternate'>
      <link rel="alternate" hreflang="tr" href="/tr">
      <link rel="alternate" type="application/rss+xml" href="http://insecure.example/feed">
    </head>`;
    expect(advertisedFeeds(html, "https://startup.example/")).toEqual([
      "https://startup.example/feed.xml",
      "https://other.example/atom",
    ]);
  });
});

describe("discoverFeed", () => {
  it("uses the feed the page advertises", async () => {
    const testFeed = vi.fn(async (url: string) => (url === "https://startup.example/news.xml" ? ok : bad));
    const result = await discoverFeed("https://startup.example/", {
      fetchPage: page('<link rel="alternate" type="application/rss+xml" href="/news.xml">'),
      testFeed,
      allowedByRobots: async () => true,
    });
    expect(result).toEqual({ ok: true, feedUrl: "https://startup.example/news.xml", itemCount: 5 });
    expect(testFeed).toHaveBeenCalledTimes(1);
  });

  it("falls back to the usual paths, skips comment feeds, and tries at most six addresses", async () => {
    const tried: string[] = [];
    const result = await discoverFeed("https://startup.example/blog", {
      fetchPage: page('<link rel="alternate" type="application/rss+xml" href="/comments/feed/">'),
      testFeed: async (url) => {
        tried.push(url);
        return bad;
      },
      allowedByRobots: async () => true,
    });
    expect(result.ok).toBe(false);
    expect(tried).toHaveLength(6);
    expect(tried.some((u) => u.includes("comments"))).toBe(false);
    expect(tried[0]).toBe("https://startup.example/feed/");
  });

  it("still tries the usual paths when the page itself cannot be read", async () => {
    const result = await discoverFeed("https://startup.example/", {
      fetchPage: page("", 404),
      testFeed: async (url) => (url.endsWith("/rss") ? ok : bad),
      allowedByRobots: async () => true,
    });
    expect(result).toMatchObject({ ok: true, feedUrl: "https://startup.example/rss" });
  });

  it("does not touch a site whose robots.txt forbids the bot", async () => {
    const fetchPage = vi.fn();
    const result = await discoverFeed("https://startup.example/", { fetchPage, testFeed: async () => ok, allowedByRobots: async () => false });
    expect(result).toEqual({ ok: false, message: "robots.txt asks bots to stay away." });
    expect(fetchPage).not.toHaveBeenCalled();
  });

  it("reports a fetch failure instead of throwing", async () => {
    const result = await discoverFeed("https://startup.example/", {
      fetchPage: async () => {
        throw new Error("timeout");
      },
      testFeed: async () => ok,
      allowedByRobots: async () => true,
    });
    expect(result).toEqual({ ok: false, message: "Could not read it: timeout" });
  });
});
