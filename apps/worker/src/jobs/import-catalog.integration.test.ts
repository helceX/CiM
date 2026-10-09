import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq, inArray, like } from "drizzle-orm";
import { db, schema, setCatalogImportEnabled } from "@cim/db";
import type { ImportCandidate } from "@cim/core/catalog-import";
import { BACKOFF_NOTE, FINISHED_NOTE, PER_HOST_PER_BATCH, processImportCatalogJob } from "./import-catalog";

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
  it("looks for a feed on an organisation's web page and stores the feed it finds, not the page", async () => {
    const page = candidate(7, { url: `https://${stamp}-7.example/`, discover: true, type: "website" });
    const found = await processImportCatalogJob({
      ...base,
      candidates: [page],
      findFeed: async (url) => ({ ok: true, feedUrl: `${url}news/feed.xml`, itemCount: 4 }),
    });
    expect(found).toMatchObject({ added: 1, failed: 0 });
    const rows = await db.select().from(schema.sources).where(like(schema.sources.domain, `${stamp}%`));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ url: `https://${stamp}-7.example/news/feed.xml`, connector: "rss", type: "website" });
  });

  it("stores nothing for a page with no readable feed, and says why", async () => {
    const page = candidate(8, { url: `https://${stamp}-8.example/`, discover: true });
    const none = await processImportCatalogJob({
      ...base,
      candidates: [page],
      findFeed: async () => ({ ok: false, message: "No readable feed was found." }),
    });
    expect(none).toMatchObject({ added: 0, failed: 1 });
    expect(await db.select().from(schema.sources).where(like(schema.sources.domain, `${stamp}%`))).toHaveLength(0);
    const attempt = await db.select().from(schema.catalogImportAttempts).where(like(schema.catalogImportAttempts.catalogKey, `${stamp}%`));
    expect(attempt[0]).toMatchObject({ status: "failed", error: "No readable feed was found." });
  });
  it("tries a feed that failed for a reason of the moment again after a day, not after three, and up to five times", async () => {
    const timingOut = async () => ({ ok: false as const, message: "Could not read it: The operation was aborted due to timeout" });
    const t0 = new Date();
    const one = [candidate(21)];
    expect(await processImportCatalogJob({ ...base, candidates: one, testFeed: timingOut, now: () => t0 })).toMatchObject({ failed: 1 });
    let when = t0;
    for (let round = 2; round <= 5; round += 1) {
      when = new Date(when.getTime() + 25 * 3_600_000);
      const again = await processImportCatalogJob({ ...base, candidates: one, testFeed: timingOut, now: () => when });
      expect(again.failed).toBe(1);
    }
    const sixth = await processImportCatalogJob({ ...base, candidates: one, testFeed: timingOut, now: () => new Date(when.getTime() + 25 * 3_600_000) });
    expect(sixth.failed).toBe(0);
    const [row] = await db.select().from(schema.catalogImportAttempts).where(eq(schema.catalogImportAttempts.catalogKey, one[0]!.key));
    expect(row).toMatchObject({ status: "failed", attempts: 5 });
  });

  it("records an unexpected error as a failure with its reason instead of dropping it, so it is not picked again at once", async () => {
    const one = [candidate(31)];
    const exploding = async () => {
      throw new Error("boom");
    };
    const t0 = new Date();
    const first = await processImportCatalogJob({ ...base, candidates: one, testFeed: exploding, now: () => t0 });
    expect(first).toMatchObject({ added: 0, failed: 1 });
    const [row] = await db.select().from(schema.catalogImportAttempts).where(eq(schema.catalogImportAttempts.catalogKey, one[0]!.key));
    expect(row).toMatchObject({ status: "failed", attempts: 1 });
    expect(row?.error).toMatch(/Unexpected error: boom/);
    const again = await processImportCatalogJob({ ...base, candidates: one, testFeed: exploding, now: () => new Date(t0.getTime() + 300_000) });
    expect(again.failed).toBe(0); // five minutes later it is not tried again
  });

  it("does not blame the feeds when a whole batch times out across many sites: records nothing against them and backs off", async () => {
    const many = Array.from({ length: 24 }, (_, n) => candidate(100 + n, { url: `https://${stamp}-h${n}.example/feed` }));
    const timingOut = async () => ({ ok: false as const, message: "Could not read it: The operation was aborted due to timeout" });
    const t0 = new Date();
    const storm = await processImportCatalogJob({ ...base, candidates: many, testFeed: timingOut, now: () => t0 });
    expect(storm.failed).toBe(24);
    expect(storm.note).toMatch(new RegExp(`^${BACKOFF_NOTE}`));
    expect(storm.note).toMatch(/timeout 24/);
    const recorded = await db.select().from(schema.catalogImportAttempts).where(like(schema.catalogImportAttempts.catalogKey, `${stamp}-1__`));
    expect(recorded).toHaveLength(0);

    // the hold: five minutes later it does nothing at all (no fetches)
    let fetches = 0;
    const counting = async () => {
      fetches += 1;
      return { ok: true as const, itemCount: 1, sampleTitles: ["a"] };
    };
    const during = await processImportCatalogJob({ ...base, candidates: many, testFeed: counting, now: () => new Date(t0.getTime() + 300_000) });
    expect(during.note).toMatch(new RegExp(`^${BACKOFF_NOTE}`));
    expect(fetches).toBe(0);

    // after the hold the same feeds are tried again — and added, now that the fault is gone
    const after = await processImportCatalogJob({ ...base, candidates: many, testFeed: counting, now: () => new Date(t0.getTime() + 31 * 60_000) });
    expect(after.added).toBe(24);
    expect(fetches).toBe(24);
  });

  it("holds feeds that really are dead against them even in a big batch (HTTP 404 is the feed's fault)", async () => {
    const many = Array.from({ length: 24 }, (_, n) => candidate(200 + n, { url: `https://${stamp}-d${n}.example/feed` }));
    const gone = async () => ({ ok: false as const, message: "The server answered HTTP 404." });
    const result = await processImportCatalogJob({ ...base, candidates: many, testFeed: gone });
    expect(result.failed).toBe(24);
    expect(result.note).toBeNull();
    const recorded = await db.select().from(schema.catalogImportAttempts).where(like(schema.catalogImportAttempts.catalogKey, `${stamp}-2__`));
    expect(recorded).toHaveLength(24);
    expect(recorded.every((row) => row.status === "failed" && /404/.test(row.error ?? ""))).toBe(true);
  });

  it("asks one publisher for at most two feeds per batch, and never two at the same time", async () => {
    const sameHost = Array.from({ length: 12 }, (_, n) => candidate(300 + n, { url: `https://${stamp}-one.example/feed/${n}` }));
    const others = Array.from({ length: 4 }, (_, n) => candidate(400 + n, { url: `https://${stamp}-other${n}.example/feed` }));
    let running = 0;
    let peakOnOne = 0;
    let asked = 0;
    const slow = async (url: string) => {
      asked += 1;
      const isOne = url.includes(`${stamp}-one.example`);
      if (isOne) {
        running += 1;
        peakOnOne = Math.max(peakOnOne, running);
      }
      await new Promise((resolve) => setTimeout(resolve, 15));
      if (isOne) running -= 1;
      return { ok: true as const, itemCount: 1, sampleTitles: ["a"] };
    };
    const result = await processImportCatalogJob({ ...base, candidates: [...sameHost, ...others], testFeed: slow });
    expect(result.added).toBe(PER_HOST_PER_BATCH + others.length);
    expect(asked).toBe(PER_HOST_PER_BATCH + others.length);
    expect(peakOnOne).toBe(1);
    // the rest of that publisher's feeds follow in the next batches, two at a time
    const next = await processImportCatalogJob({ ...base, candidates: [...sameHost, ...others], testFeed: slow });
    expect(next.added).toBe(PER_HOST_PER_BATCH);
  });

  it("once everything is added or tried it only looks again after an hour, and resuming from the panel looks at once", async () => {
    const t0 = new Date();
    expect((await processImportCatalogJob({ ...base, now: () => t0 })).added).toBe(3);
    const done = await processImportCatalogJob({ ...base, now: () => t0 });
    expect(done.note).toBe(FINISHED_NOTE);
    let scanned = 0;
    const spy = async () => {
      scanned += 1;
      return { ok: true as const, itemCount: 1, sampleTitles: ["a"] };
    };
    const extra = candidate(50);
    const quiet = await processImportCatalogJob({ ...base, candidates: [...candidates, extra], testFeed: spy, now: () => new Date(t0.getTime() + 600_000) });
    expect(quiet.note).toBe(FINISHED_NOTE);
    expect(scanned).toBe(0);
    // an operator resuming clears the hold
    await setCatalogImportEnabled(db, false);
    await setCatalogImportEnabled(db, true);
    const resumed = await processImportCatalogJob({ ...base, candidates: [...candidates, extra], testFeed: spy, now: () => new Date(t0.getTime() + 900_000) });
    expect(resumed.added).toBe(1);
    expect(scanned).toBe(1);
  });
});
