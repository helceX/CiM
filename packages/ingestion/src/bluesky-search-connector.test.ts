import { describe, expect, it, vi } from "vitest";
import { BlueskySearchConnector, blueskySearchUrl, parseBlueskyPosts, parseBlueskySearchUrl } from "./bluesky-search-connector";
import { classifyMatchType, findMatchedTerm, matchesText } from "@cim/core";
import type { Source } from "@cim/db/schema";
import type { safeFetch } from "./safe-fetch";

const did = "did:plc:abcdefghijklmno";
const target = { did: "did:plc:targetaccount", handle: "lunavera.bsky.social" };
function post(text: string, tagged = false) {
  return { uri: `at://${did}/app.bsky.feed.post/3example`, author: { did, handle: "someone.bsky.social", displayName: "Someone" }, record: { text, createdAt: "2026-10-11T10:00:00Z", langs: ["tr"], ...(tagged ? { facets: [{ index: { byteStart: 0, byteEnd: Buffer.byteLength("@lunavera.bsky.social") }, features: [{ $type: "app.bsky.richtext.facet#mention", did: target.did }] }] } : {}) } };
}
const body = (posts: unknown[]) => JSON.stringify({ posts });

describe("free public Bluesky search", () => {
  it("matches an untagged brand name and returns real author/platform metadata without inventing followers", () => {
    const [raw] = parseBlueskyPosts(body([post("Lunavera Teknoloji enerji projesini duyurdu.")]));
    expect(raw?.socialMentionHandles).toEqual([]);
    expect(raw?.socialPlatform).toBe("bluesky");
    expect(raw?.socialAuthorHandle).toBe("someone.bsky.social");
    expect(raw?.socialAuthorFollowers).toBeUndefined();
    const ast = { include: ["@lunavera.bsky.social", "Lunavera Teknoloji"], exclude: [], exactPhrases: [] };
    expect(matchesText(ast, raw!.bodyText)).toBe(true);
    expect(classifyMatchType(ast, findMatchedTerm(ast, raw!.bodyText)!, "social").matchType).toBe("contextual");
  });
  it("uses structured account facets for tags and rejects a plain-text lookalike from a tagged search", () => {
    const records = parseBlueskyPosts(body([post("@lunavera.bsky.social merhaba", true), post("@lunavera.bsky.social is just text")]), target);
    expect(records).toHaveLength(1);
    expect(records[0]?.socialMentionHandles).toContain("@lunavera.bsky.social");
    expect(parseBlueskyPosts(body([post("@lunavera.bsky.social merhaba", true)]), { ...target, did: "did:plc:anotheraccount" })).toEqual([]);
  });
  it("keeps UTF-8 facet boundaries intact and skips malformed/untrusted canonical URLs", () => {
    const original = post("@lunavera.bsky.social merhaba", true);
    original.record.text = "Şimdi @lunavera.bsky.social";
    original.record.facets![0]!.index = { byteStart: Buffer.byteLength("Şimdi "), byteEnd: Buffer.byteLength(original.record.text) };
    expect(parseBlueskyPosts(body([original]), target)[0]?.socialMentionHandles).toEqual(["@lunavera.bsky.social"]);
    expect(parseBlueskyPosts(body([{ ...original, uri: "https://evil.example/post" }, { ...original, author: { ...original.author, did: "did:plc:other" } }]))).toEqual([]);
  });
  it("only permits the fixed official endpoint and caps results", () => {
    const url = blueskySearchUrl("Lunavera & enerji");
    expect(parseBlueskySearchUrl(url).term).toBe("Lunavera & enerji");
    for (const url of ["http://api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=x", "https://user:pass@api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=x", "https://evil.example/xrpc/app.bsky.feed.searchPosts?q=x", "https://api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=x&cursor=all", "https://api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=x&mentions=did:plc:x"]) expect(() => parseBlueskySearchUrl(url)).toThrow();
    expect(parseBlueskyPosts(body(Array.from({ length: 50 }, () => post("Lunavera"))))).toHaveLength(30);
  });
  it("never trusts the displayed handle when its actual facet identity points to another account", () => {
    const spoof = post("@lunavera.bsky.social hello", true);
    spoof.record.facets![0]!.features[0]!.did = "did:plc:differentaccount";
    expect(parseBlueskyPosts(body([spoof]))[0]?.socialMentionHandles).toEqual([]);
    expect(parseBlueskyPosts(body([spoof]), target)).toEqual([]);
    const actual = post("@lunavera.bsky.social hello", true);
    expect(parseBlueskyPosts(body([actual]), target)[0]?.bodyText).toBe(actual.record.text);
  });
  it("allows zero results and reuses the health response instead of downloading twice", async () => {
    const fetcher = vi.fn<typeof safeFetch>().mockResolvedValue({ status: 200, body: body([]), headers: new Headers() as never, finalUrl: "https://api.bsky.app" });
    const connector = new BlueskySearchConnector(fetcher);
    const source = { id: "source", url: blueskySearchUrl("Lunavera") } as Source;
    expect((await connector.healthCheck(source)).status).toBe("healthy");
    expect(await connector.fetch(source)).toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const request = new URL(fetcher.mock.calls[0]![0]);
    expect(request.searchParams.get("limit")).toBe("30");
    expect(request.searchParams.get("sort")).toBe("latest");
    expect(request.searchParams.get("since")).toBeTruthy();
    expect(fetcher.mock.calls[0]![1]).toMatchObject({ timeoutMs: 8000, maxRedirects: 0, maxResponseBytes: 1048576 });
  });
  it("honours rate limiting and never turns failures into synthetic posts", async () => {
    const fetcher = vi.fn<typeof safeFetch>().mockResolvedValue({ status: 429, body: "", headers: new Headers({ "retry-after": "120" }) as never, finalUrl: "https://api.bsky.app" });
    const result = await new BlueskySearchConnector(fetcher).healthCheck({ id: "source", url: blueskySearchUrl("Lunavera") } as Source);
    expect(result).toMatchObject({ status: "error", retryAfterMs: 120000 });
  });
  it("applies the recent window locally for wildcard account searches, which reject the API since parameter", async () => {
    const recent = post("@lunavera.bsky.social merhaba", true);
    recent.record.createdAt = new Date().toISOString();
    const old = post("@lunavera.bsky.social eski", true);
    old.record.createdAt = new Date(Date.now() - 4 * 24 * 60 * 60_000).toISOString();
    const fetcher = vi.fn<typeof safeFetch>().mockResolvedValue({ status: 200, body: body([recent, old]), headers: new Headers() as never, finalUrl: "https://api.bsky.app" });
    const items = await new BlueskySearchConnector(fetcher).read(blueskySearchUrl("Lunavera", target));
    const request = new URL(fetcher.mock.calls[0]![0]);
    expect(request.searchParams.get("since")).toBeNull();
    expect(request.searchParams.get("mentions")).toBe(target.did);
    expect(items).toHaveLength(1);
    expect(items[0]?.bodyText).toContain("merhaba");
  });
  it("filters old and future authored dates from brand searches even when the API index returns them", async () => {
    const recent = post("Lunavera announced a product");
    recent.record.createdAt = new Date().toISOString();
    const old = post("Lunavera old post indexed today");
    old.record.createdAt = new Date(Date.now() - 4 * 24 * 60 * 60_000).toISOString();
    const future = post("Lunavera with an invalid future authored date");
    future.record.createdAt = new Date(Date.now() + 24 * 60 * 60_000).toISOString();
    const fetcher = vi.fn<typeof safeFetch>().mockResolvedValue({ status: 200, body: body([recent, old, future]), headers: new Headers() as never, finalUrl: "https://api.bsky.app" });
    expect(await new BlueskySearchConnector(fetcher).read(blueskySearchUrl("Lunavera"))).toHaveLength(1);
  });
});
