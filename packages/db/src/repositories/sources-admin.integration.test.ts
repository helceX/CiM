import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../client";
import { sources } from "../schema/content";
import { createSource, listActiveSources, setSourceCrawlEnabled } from "./sources";

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
});
