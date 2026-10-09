import { afterAll, describe, expect, it } from "vitest";
import { crawlStatsKey } from "@cim/core";
import { getRedis } from "./redis";
import { getCrawlStats } from "./crawl-stats";

/** Real Redis: the admin page sums the worker's hourly counters over the window it asks for. */
describe("getCrawlStats (integration)", () => {
  // an hour far in the past so a running worker's counters are not involved
  const at = new Date("2031-03-04T05:00:00Z");
  const keys = [crawlStatsKey(at), crawlStatsKey(new Date(at.getTime() - 3_600_000)), crawlStatsKey(new Date(at.getTime() - 30 * 3_600_000))];

  afterAll(async () => {
    await getRedis().del(...keys);
  });

  it("adds up the hours inside the window and ignores older ones", async () => {
    const redis = getRedis();
    await redis.hset(keys[0]!, { checks: "10", not_modified: "6", new_articles: "2" });
    await redis.hset(keys[1]!, { checks: "5", failed: "1" });
    await redis.hset(keys[2]!, { checks: "999" }); // thirty hours back: outside a 24-hour window
    const totals = await getCrawlStats(24, at);
    expect(totals).toMatchObject({ checks: 15, not_modified: 6, failed: 1, new_articles: 2, unchanged: 0, backoff_skips: 0 });
  });

  it("reports zeros for a window with nothing in it", async () => {
    const totals = await getCrawlStats(24, new Date("2032-01-01T00:00:00Z"));
    expect(totals?.checks).toBe(0);
  });
});
