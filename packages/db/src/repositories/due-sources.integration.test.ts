import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inArray } from "drizzle-orm";
import { isSourceDue } from "@cim/core";
import { db } from "../client";
import { sources } from "../schema/content";
import { listActiveSources, listDueSources } from "./sources";

/**
 * The scheduler asks the database for the sources that are due instead of reading every row. isSourceDue
 * (core/crawl-interval.ts) is the rule of record, so the query must agree with it on every kind of source.
 */
describe("listDueSources (integration)", () => {
  const stamp = Date.now();
  const now = new Date();
  const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000);
  const cases = [
    { key: "never", connector: "rss", status: "healthy", lastCheckedAt: null },
    { key: "fresh-rss", connector: "rss", status: "healthy", lastCheckedAt: minutesAgo(2) },
    { key: "just-under", connector: "rss", status: "healthy", lastCheckedAt: minutesAgo(119) },
    { key: "just-over", connector: "rss", status: "healthy", lastCheckedAt: minutesAgo(121) },
    { key: "stale-sitemap", connector: "sitemap", status: "error", lastCheckedAt: minutesAgo(300) },
    { key: "fresh-api", connector: "api", status: "delayed", lastCheckedAt: minutesAgo(30) },
    { key: "stale-unknown-connector", connector: "something-new", status: "healthy", lastCheckedAt: minutesAgo(125) },
    { key: "fresh-unknown-connector", connector: "something-new", status: "healthy", lastCheckedAt: minutesAgo(60) },
    { key: "mock-fresh", connector: "mock", status: "healthy", lastCheckedAt: new Date(now.getTime() - 10_000) },
    { key: "mock-stale", connector: "mock", status: "healthy", lastCheckedAt: new Date(now.getTime() - 40_000) },
    { key: "unavailable-stale", connector: "rss", status: "unavailable", lastCheckedAt: minutesAgo(500) },
    { key: "blocked-stale", connector: "rss", status: "blocked", lastCheckedAt: minutesAgo(500) },
  ];
  const ids: string[] = [];

  beforeAll(async () => {
    for (const c of cases) {
      const [row] = await db
        .insert(sources)
        .values({ name: `due-${c.key}`, domain: `due-${c.key}-${stamp}.example`, type: "news", connector: c.connector, status: c.status, lastCheckedAt: c.lastCheckedAt })
        .returning({ id: sources.id });
      ids.push(row!.id);
    }
  });

  afterAll(async () => {
    await db.delete(sources).where(inArray(sources.id, ids));
  });

  it("returns what isSourceDue says is due among the active sources — and nothing that is unavailable", async () => {
    const ours = new Set(ids);
    const fromQuery = (await listDueSources(db, now)).filter((s) => ours.has(s.id)).map((s) => s.id).sort();
    const fromRule = (await listActiveSources(db)).filter((s) => ours.has(s.id) && isSourceDue(s, now)).map((s) => s.id).sort();
    expect(fromQuery).toEqual(fromRule);

    const nameOf = new Map(ids.map((id, i) => [id, cases[i]!.key]));
    expect(fromQuery.map((id) => nameOf.get(id)).sort()).toEqual(
      ["blocked-stale", "just-over", "mock-stale", "never", "stale-sitemap", "stale-unknown-connector"].sort(),
    );
  });
});
