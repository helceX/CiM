import type { Source } from "@cim/db/schema";
import type { RawFetchResult, SourceConnector, SourceHealth } from "./connector";
import { makeSnippet } from "./normalize";
import { safeFetch } from "./safe-fetch";
import { parseRetryAfter } from "@cim/core";

const ENDPOINT = "https://api.bsky.app/xrpc/app.bsky.feed.searchPosts";
const DID = /^did:(?:plc:[a-z0-9]+|web:[a-zA-Z0-9.:%_-]+)$/;
const HANDLE = /^[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+$/;

/** Fixed official endpoint; no credentials, arbitrary API URLs or pagination. */
export function blueskySearchUrl(term: string, tagged?: { did: string; handle: string }): string {
  if (!term.trim() || term.length > 120) throw new Error("Enter a search term of 1–120 characters.");
  if (tagged && (!DID.test(tagged.did) || !HANDLE.test(tagged.handle))) throw new Error("Invalid Bluesky account.");
  const url = new URL(ENDPOINT);
  url.searchParams.set("q", tagged ? "*" : term.trim());
  if (tagged) {
    url.searchParams.set("mentions", tagged.did);
    url.searchParams.set("handle", tagged.handle.toLowerCase());
  }
  return url.href;
}

export function parseBlueskySearchUrl(address: string) {
  const url = new URL(address);
  if (url.origin + url.pathname !== ENDPOINT || url.username || url.password || url.hash) throw new Error("Only the official Bluesky search endpoint is supported.");
  if ([...url.searchParams.keys()].some((key) => !["q", "mentions", "handle"].includes(key))) throw new Error("Unsupported search option.");
  const term = url.searchParams.get("q") ?? "";
  const did = url.searchParams.get("mentions");
  const handle = url.searchParams.get("handle");
  if (Boolean(did) !== Boolean(handle)) throw new Error("A tagged account needs its DID and handle.");
  blueskySearchUrl(term, did && handle ? { did, handle } : undefined);
  return { term, did, handle };
}

type Post = {
  uri?: string;
  author?: { did?: string; handle?: string; displayName?: string };
  record?: { text?: string; createdAt?: string; langs?: string[]; facets?: { index?: { byteStart: number; byteEnd: number }; features?: { $type?: string; did?: string }[] }[] };
};

/** Only public posts actually returned by the API. No invented reach or engagement. */
export function parseBlueskyPosts(body: string, target?: { did: string; handle: string }): RawFetchResult[] {
  const value = JSON.parse(body) as { posts?: Post[] };
  if (!Array.isArray(value.posts)) throw new Error("Bluesky did not return a posts list.");
  return value.posts.slice(0, 30).flatMap((post) => {
    const match = post.uri?.match(/^at:\/\/([^/]+)\/app\.bsky\.feed\.post\/([a-zA-Z0-9]+)$/);
    const author = post.author;
    const record = post.record;
    if (!match || !author?.did || !DID.test(author.did) || match[1] !== author.did || !author.handle || !HANDLE.test(author.handle) || typeof record?.text !== "string") return [];
    const bytes = Buffer.from(record.text, "utf8");
    const mentionedDids = (record.facets ?? []).flatMap((facet) => {
      if (!facet.features?.some((f) => f.$type === "app.bsky.richtext.facet#mention" && f.did && DID.test(f.did)) || !facet.index) return [];
      const { byteStart, byteEnd } = facet.index;
      if (!Number.isInteger(byteStart) || !Number.isInteger(byteEnd) || byteStart < 0 || byteEnd > bytes.length || byteEnd <= byteStart) return [];
      const part = bytes.subarray(byteStart, byteEnd);
      if (!Buffer.from(part.toString("utf8"), "utf8").equals(part)) return [];
      return (facet.features ?? []).flatMap((feature) => feature.$type === "app.bsky.richtext.facet#mention" && feature.did && DID.test(feature.did) ? [feature.did] : []);
    });
    if (target && !mentionedDids.includes(target.did)) return [];
    const date = record.createdAt ? new Date(record.createdAt) : null;
    return [{
      externalId: post.uri!,
      canonicalUrl: `https://bsky.app/profile/${author.did}/post/${match[2]}`,
      title: makeSnippet(record.text, 160),
      bodyText: record.text,
      language: record.langs?.[0] ?? null,
      publishedAt: date && Number.isFinite(date.getTime()) ? date : null,
      authorName: author.displayName ?? author.handle,
      socialPlatform: "bluesky",
      // Facet display text can name a different account than its actual DID.
      // Only the search account has a resolved, verified identity here.
      socialMentionHandles: target ? [`@${target.handle}`] : [],
      socialAuthorExternalId: author.did,
      socialAuthorHandle: author.handle,
      socialAuthorDisplayName: author.displayName ?? null,
      socialAuthorProfileUrl: `https://bsky.app/profile/${author.did}`,
    }];
  });
}

export class BlueskySearchConnector implements SourceConnector {
  private cached = new Map<string, { at: number; items: RawFetchResult[] }>();
  constructor(private readonly fetcher: typeof safeFetch = safeFetch) {}

  async read(address: string): Promise<RawFetchResult[]> {
    const search = parseBlueskySearchUrl(address);
    const url = new URL(ENDPOINT);
    url.searchParams.set("q", search.term);
    url.searchParams.set("sort", "latest");
    url.searchParams.set("limit", "30");
    // Bounded recent coverage, not a historical archive or a complete network scan.
    const recentSince = Date.now() - 3 * 24 * 60 * 60_000;
    // The official endpoint rejects wildcard mention searches combined with `since`.
    // Keep the same 3-day bound locally for tagged searches, without pagination.
    if (!search.did) url.searchParams.set("since", new Date(recentSince).toISOString());
    if (search.did) url.searchParams.set("mentions", search.did);
    const result = await this.fetcher(url.href, { timeoutMs: 8000, maxResponseBytes: 1024 * 1024, maxRedirects: 0 });
    if (result.status >= 400) {
      const error = new Error(`Bluesky search answered HTTP ${result.status}.`) as Error & { retryAfterMs?: number };
      error.retryAfterMs = parseRetryAfter(result.headers?.get("retry-after")) ?? undefined;
      throw error;
    }
    const items = parseBlueskyPosts(result.body, search.did && search.handle ? { did: search.did, handle: search.handle } : undefined);
    // API `since` is based on its search index timestamp, not necessarily the
    // authored post date. Apply the published-date bound consistently to both modes.
    return items.filter((item) => item.publishedAt && item.publishedAt.getTime() >= recentSince && item.publishedAt.getTime() <= Date.now());
  }

  async healthCheck(source: Source): Promise<SourceHealth> {
    try {
      if (!source.url) throw new Error("No Bluesky search configured.");
      const items = await this.read(source.url);
      if (this.cached.size >= 50) this.cached.clear();
      this.cached.set(source.id, { at: Date.now(), items });
      return { status: "healthy" };
    } catch (error) {
      return { status: "error", message: error instanceof Error ? error.message : "Search unavailable.", retryAfterMs: (error as { retryAfterMs?: number }).retryAfterMs };
    }
  }

  async fetch(source: Source): Promise<RawFetchResult[]> {
    const cached = this.cached.get(source.id);
    this.cached.delete(source.id);
    return cached && Date.now() - cached.at < 2 * 60_000 ? cached.items : this.read(source.url ?? "");
  }
}
