import { afterAll, describe, expect, it } from "vitest";
import { Queue } from "bullmq";
import { eq } from "drizzle-orm";
import type { CrawlSourceJobData } from "@cim/core";
import { db, schema } from "@cim/db";
import { getRedisConnection } from "../redis";
import { processCrawlSchedulerJob } from "./crawl-scheduler";

/**
 * Against real Redis and Postgres: a source whose crawl job is still waiting is
 * not queued again on the next ticks, so a busy queue cannot build a backlog.
 */
describe("processCrawlSchedulerJob (integration)", () => {
  const queue = new Queue<CrawlSourceJobData>(`crawl_source_test_${Date.now()}`, { connection: getRedisConnection() });
  let sourceId: string | undefined;

  afterAll(async () => {
    await queue.obliterate({ force: true });
    await queue.close();
    if (sourceId) await db.delete(schema.sources).where(eq(schema.sources.id, sourceId));
  });

  it("keeps one waiting job per source across many ticks, and queues again once it has finished", async () => {
    const [source] = await db
      .insert(schema.sources)
      .values({ name: "Backlog Test Feed", domain: `backlog-${Date.now()}.example`, type: "news", connector: "rss", status: "healthy", canDisplayExcerpt: true })
      .returning();
    sourceId = source!.id;

    for (let tick = 0; tick < 5; tick++) await processCrawlSchedulerJob(queue);
    const waiting = (await queue.getWaiting()).filter((job) => job.data.sourceId === sourceId);
    expect(waiting).toHaveLength(1);
    expect(waiting[0]!.id).toBe(`crawl-${sourceId}`);

    // Finish it (as the worker would) — the source is still due, so the next tick queues it again.
    await waiting[0]!.remove();
    await processCrawlSchedulerJob(queue);
    expect((await queue.getWaiting()).filter((job) => job.data.sourceId === sourceId)).toHaveLength(1);
  });
});
