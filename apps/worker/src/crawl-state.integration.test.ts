import { afterAll, describe, expect, it, vi } from "vitest";
import { CRAWL_STAT_FIELDS, crawlStatsKey } from "@cim/core";
import { getRedisConnection } from "./redis";
import { MAX_SEEN, redisCrawlStateStore, redisCrawlStats, type CrawlState } from "./crawl-state";

/** Against real Redis: what a crawl remembers about a source, and the counters the admin page reads back. */
describe("crawl state in Redis (integration)", () => {
  const redis = getRedisConnection();
  const sourceId = `test-source-${Date.now()}`;
  const store = redisCrawlStateStore(redis);
  const statsKey = crawlStatsKey(new Date());
  let statsBefore: Record<string, string> = {};

  afterAll(async () => {
    await redis.del(`crawl:state:${sourceId}`);
  });

  it("returns nothing for a source it has never seen, and what was stored for one it has", async () => {
    expect(await store.get(sourceId)).toBeNull();
    const state: CrawlState = { sig: "abc", seen: ["k1", "k2"], validators: { etag: '"v1"' }, fullAt: 1_000, failures: 2, nextAt: 5_000 };
    await store.set(sourceId, state);
    expect(await store.get(sourceId)).toEqual(state);
    expect(await redis.ttl(`crawl:state:${sourceId}`)).toBeGreaterThan(0);
  });

  it("keeps at most MAX_SEEN story keys", async () => {
    await store.set(sourceId, { sig: "abc", seen: Array.from({ length: MAX_SEEN + 50 }, (_, i) => `k${i}`), fullAt: 1, failures: 0 });
    expect((await store.get(sourceId))?.seen).toHaveLength(MAX_SEEN);
  });

  it("falls back to 'nothing remembered' when Redis fails, instead of failing the crawl", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const broken = redisCrawlStateStore({ get: async () => Promise.reject(new Error("down")), set: async () => Promise.reject(new Error("down")) } as never);
    expect(await broken.get("x")).toBeNull();
    await expect(broken.set("x", { sig: "s", seen: [], fullAt: 0, failures: 0 })).resolves.toBeUndefined();
    warn.mockRestore();
  });

  it("counts into the hourly hash the admin page sums, with an expiry", async () => {
    statsBefore = await redis.hgetall(statsKey);
    const count = redisCrawlStats(redis);
    await count({ checks: 3, not_modified: 2, backoff_skips: 0 });
    await count({ checks: 1, new_articles: 5 });
    const after = await redis.hgetall(statsKey);
    const delta = (field: string) => Number(after[field] ?? 0) - Number(statsBefore[field] ?? 0);
    expect(delta("checks")).toBe(4);
    expect(delta("not_modified")).toBe(2);
    expect(delta("new_articles")).toBe(5);
    expect(delta("backoff_skips")).toBe(0);
    expect(await redis.ttl(statsKey)).toBeGreaterThan(0);
    expect(CRAWL_STAT_FIELDS).toContain("not_modified");
    // put the counters back so a real worker's numbers are not skewed by the test
    for (const field of ["checks", "not_modified", "new_articles"]) await redis.hincrby(statsKey, field, -delta(field));
  });
});
