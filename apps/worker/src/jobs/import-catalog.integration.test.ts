import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq, inArray, like } from "drizzle-orm";
import { db, schema, setCatalogImportEnabled } from "@cim/db";
import type { ImportCandidate } from "@cim/core/catalog-import";
import { processImportCatalogJob } from "./import-catalog";

const stamp = `imp${Date.now()}`;
const candidate = (n: number, extra: Partial<ImportCandidate> = {}): ImportCandidate => ({
  key: `${stamp}-${n}`,
  name: `${stamp} feed ${n}`,
  url: `https://${stamp}-${n}.example/feed`,
  type: "news",
  language: "tr",
  country: "TR",
  verified: false,
  rank: 0,
  ...extra,
});
const candidates = [candidate(1), candidate(2), candidate(3)];
const okFeed = async () => ({ ok: true as const, itemCount: 3, sampleTitles: ["a"] });
const env = { DB_VOLUME_MB: "1000000" };
const base = { crawlBacklog: async () => 0, candidates, env, testFeed: okFeed };

beforeEach(async () => {
  await db.delete(schema.catalogImportAttempts).where(like(schema.catalogImportAttempts.catalogKey, `${stamp}%`));
  await db.delete(schema.sources).where(like(schema.sources.domain, `${stamp}%`));
  await setCatalogImportEnabled(db, true);
});

afterAll(async () => {
  await db.delete(schema.catalogImportAttempts).where(like(schema.catalogImportAttempts.catalogKey, `${stamp}%`));
  await db.delete(schema.sources).where(like(schema.sources.domain, `${stamp}%`));
  await setCatalogImportEnabled(db, true);
});

describe("processImportCatalogJob (integration)", () => {
  it("adds readable feeds as sources, records them, and does not repeat itself", async () => {
    const first = await processImportCatalogJob(base);
    expect(first).toMatchObject({ added: 3, failed: 0 });
    const rows = await db.select().from(schema.sources).where(like(schema.sources.domain, `${stamp}%`));
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ connector: "rss", type: "news", language: "tr", country: "TR", canStoreFullText: false });

    const second = await processImportCatalogJob(base);
    expect(second.added).toBe(0);
    expect(second.note).toMatch(/Finished/);
  });

  it("stores nothing for an unreadable feed, tries it again only after days, and never more than twice", async () => {
    const failing = async () => ({ ok: false as const, message: "The server answered HTTP 403." });
    const t0 = new Date();
    const first = await processImportCatalogJob({ ...base, testFeed: failing, now: () => t0 });
    expect(first).toMatchObject({ added: 0, failed: 3 });
    expect(await db.select().from(schema.sources).where(like(schema.sources.domain, `${stamp}%`))).toHaveLength(0);

    const soon = await processImportCatalogJob({ ...base, testFeed: failing, now: () => new Date(t0.getTime() + 3_600_000) });
    expect(soon.note).toMatch(/Finished/); // too soon to retry

    const later = new Date(t0.getTime() + 4 * 24 * 3_600_000);
    const retry = await processImportCatalogJob({ ...base, testFeed: failing, now: () => later });
    expect(retry.failed).toBe(3);
    const third = await processImportCatalogJob({ ...base, testFeed: failing, now: () => new Date(later.getTime() + 5 * 24 * 3_600_000) });
    expect(third.failed).toBe(0); // two attempts is the limit
  });

  it("stands down — and says why — when paused, when the volume size is unknown, or when the crawl queue is backed up", async () => {
    await setCatalogImportEnabled(db, false);
    expect((await processImportCatalogJob(base)).note).toMatch(/Paused/);
    await setCatalogImportEnabled(db, true);

    expect((await processImportCatalogJob({ ...base, env: {} })).note).toMatch(/DB_VOLUME_MB/);
    expect((await processImportCatalogJob({ ...base, env: { DB_VOLUME_MB: "1" } })).note).toMatch(/volume/);
    expect((await processImportCatalogJob({ ...base, crawlBacklog: async () => 5000 })).note).toMatch(/crawl queue/);
    // long queue but moving (oldest job waited 20 minutes): not held back; stuck (3 hours): held back
    const moving = await processImportCatalogJob({ ...base, crawlBacklog: async () => 1900, crawlOldestWaitMs: async () => 20 * 60_000, candidates: [] });
    expect(moving.note).toMatch(/Finished/);
    const stuck = await processImportCatalogJob({ ...base, crawlBacklog: async () => 1900, crawlOldestWaitMs: async () => 3 * 3_600_000 });
    expect(stuck.note).toMatch(/catch up/);
    expect(await db.select().from(schema.sources).where(like(schema.sources.domain, `${stamp}%`))).toHaveLength(0);

    const [state] = await db.select().from(schema.catalogImportState).where(eq(schema.catalogImportState.id, 1));
    expect(state?.lastNote).toMatch(/crawl queue/);
  });

  it("records a blocked publisher as skipped instead of contacting it", async () => {
    const blocked = candidate(9, { url: "https://www.aa.com.tr/tr/rss/default?cat=guncel" });
    const result = await processImportCatalogJob({ ...base, candidates: [blocked] });
    expect(result).toMatchObject({ added: 0, skipped: 1 });
    const [attempt] = await db.select().from(schema.catalogImportAttempts).where(inArray(schema.catalogImportAttempts.catalogKey, [blocked.key]));
    expect(attempt?.status).toBe("skipped");
    await db.delete(schema.catalogImportAttempts).where(eq(schema.catalogImportAttempts.catalogKey, blocked.key));
  });
});
