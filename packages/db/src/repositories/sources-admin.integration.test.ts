import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../client";
import { sources } from "../schema/content";
import { blockedDomains } from "../schema/compliance";
import { bulkSetSourcesCrawlEnabled, createSource, listActiveSources, setSourceCrawlEnabled } from "./sources";

describe("admin source management (integration)", () => {
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const url = `https://www.feed-${unique}.example/rss.xml`;
  const created: string[] = [];

  afterAll(async () => {
    for (const id of created) await db.delete(sources).where(eq(sources.id, id));
  });

  const input = {
    name: "Test Feed",
    url,
    connector: "rss" as const,
    type: "news",
    language: "tr",
    country: "TR",
  };

  it("creates a source with a store-excerpt-only policy and the host as domain", async () => {
    const result = await createSource(db, input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    created.push(result.id);
    const [row] = await db.select().from(sources).where(eq(sources.id, result.id));
    expect(row?.domain).toBe(`feed-${unique}.example`);
    expect(row?.canStoreFullText).toBe(false);
    expect(row?.canStoreMedia).toBe(false);
    expect(row?.connector).toBe("rss");
  });

  it("stores a global social feed (country ZZ) without a country", async () => {
    const result = await createSource(db, { ...input, url: `https://www.reddit-${unique}.example/r/x/.rss`, type: "social", country: "ZZ" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    created.push(result.id);
    const [row] = await db.select().from(sources).where(eq(sources.id, result.id));
    expect(row?.country).toBeNull();
    expect(row?.type).toBe("social");
  });

  it("refuses a second source with the same feed URL", async () => {
    const result = await createSource(db, input);
    expect(result).toEqual({ ok: false, reason: "duplicate" });
  });

  it("creates exactly one source when the same new feed is added concurrently", async () => {
    const raced = { ...input, url: `https://raced-${unique}.example/feed` };
    const results = await Promise.all([createSource(db, raced), createSource(db, raced)]);
    for (const r of results) if (r.ok) created.push(r.id);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toHaveLength(1);
  });

  it("pauses and resumes crawling without deleting the source", async () => {
    const id = created[0]!;
    expect(await setSourceCrawlEnabled(db, id, false)).toBe(true);
    expect((await listActiveSources(db)).some((s) => s.id === id)).toBe(false);
    expect(await setSourceCrawlEnabled(db, id, true)).toBe(true);
    expect((await listActiveSources(db)).some((s) => s.id === id)).toBe(true);
    expect(await setSourceCrawlEnabled(db, "00000000-0000-4000-8000-000000000000", true)).toBe(false);
  });

  describe("bulk pause / resume", () => {
    const ids: Record<string, string> = {};
    const tag = `bulk-${unique}`;
    const blockedHost = `${tag}-blocked.example`;

    async function make(key: string, values: { country: string; type: string; connector?: string; domain?: string }) {
      const [row] = await db
        .insert(sources)
        .values({
          name: `${tag}-${key}`,
          domain: values.domain ?? `${tag}-${key}.example`,
          url: `https://${tag}-${key}.example/feed`,
          type: values.type,
          connector: values.connector ?? "rss",
          country: values.country,
          language: "tr",
        })
        .returning({ id: sources.id });
      ids[key] = row!.id;
      created.push(row!.id);
    }

    async function statusOf(key: string) {
      const [row] = await db.select({ status: sources.status }).from(sources).where(eq(sources.id, ids[key]!));
      return row?.status;
    }

    afterAll(async () => {
      await db.delete(blockedDomains).where(eq(blockedDomains.domain, blockedHost));
    });

    it("pauses by country and kind, leaves other slices and mock connectors alone, and resumes", async () => {
      await make("tr-news", { country: "TR", type: "news" });
      await make("tr-forum", { country: "TR", type: "forum" });
      await make("de-news", { country: "DE", type: "news" });
      await make("tr-mock", { country: "TR", type: "news", connector: "mock" });

      // Only Turkish forums.
      let result = await bulkSetSourcesCrawlEnabled(db, { countries: ["TR"], types: ["forum"] }, false);
      expect(result.changed).toBeGreaterThanOrEqual(1);
      expect(await statusOf("tr-forum")).toBe("unavailable");
      expect(await statusOf("tr-news")).toBe("healthy");
      expect(await statusOf("de-news")).toBe("healthy");

      // The whole of Türkiye (by explicit ids so other test data is not touched).
      result = await bulkSetSourcesCrawlEnabled(db, { ids: [ids["tr-news"]!, ids["tr-forum"]!, ids["tr-mock"]!] }, false);
      expect(result.changed).toBe(1); // tr-forum already paused, tr-mock is never touched
      expect(await statusOf("tr-news")).toBe("unavailable");
      expect(await statusOf("tr-mock")).toBe("healthy");
      expect(await statusOf("de-news")).toBe("healthy");

      result = await bulkSetSourcesCrawlEnabled(db, { ids: [ids["tr-news"]!, ids["tr-forum"]!] }, true);
      expect(result.changed).toBe(2);
      expect(await statusOf("tr-news")).toBe("delayed");
    });

    it("never resumes a blocked publisher", async () => {
      await make("blocked", { country: "TR", type: "news", domain: blockedHost });
      await bulkSetSourcesCrawlEnabled(db, { ids: [ids["blocked"]!] }, false);
      await db.insert(blockedDomains).values({ domain: blockedHost, reason: "test" });
      const result = await bulkSetSourcesCrawlEnabled(db, { ids: [ids["blocked"]!] }, true);
      expect(result).toEqual({ changed: 0, skippedBlocked: 1 });
      expect(await statusOf("blocked")).toBe("unavailable");
    });
  });
});
