import { afterAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "../client";
import { sources } from "../schema/content";
import { blockedDomains } from "../schema/compliance";
import { applyTurkeyStartupCrawlPolicy } from "./source-cost-policy";
import { markSourceChecked } from "./sources";
import { TURKEY_SOURCE_CATALOG } from "@cim/core";

describe("Türkiye + Startup crawl scope", () => {
  const ids: string[] = [];
  const stamp = `scope-${Date.now()}`;
  const blockedHost = `${stamp}.example`;
  afterAll(async () => {
    if (ids.length) await db.delete(sources).where(inArray(sources.id, ids));
    await db.delete(blockedDomains).where(eq(blockedDomains.domain, blockedHost));
  });

  it("pauses other world sources, retains Turkish and startup feeds and preserves existing pauses and opt-outs", async () => {
    const writer = TURKEY_SOURCE_CATALOG.find((s) => s.group === "columns")!;
    const base = {
      domain: "scope.example",
      type: "news",
      connector: "rss",
      language: "en",
      country: "US",
      status: "healthy",
    };
    const fixtures = [
      { ...base, name: "Turkish abroad", language: "tr", country: "DE" },
      { ...base, name: "World general" },
      { ...base, name: "Startup grant calls", status: "unavailable" },
      { ...base, name: "Blocked startup", status: "unavailable", domain: blockedHost },
      {
        ...base,
        name: "Paused writer",
        status: "unavailable",
        country: "TR",
        url: writer.url,
      },
      { ...base, name: "Paused Türkiye", status: "unavailable", country: "TR" },
    ];
    for (const fixture of fixtures) {
      const [row] = await db
        .insert(sources)
        .values(fixture)
        .returning({ id: sources.id });
      ids.push(row!.id);
    }
    await db
      .insert(blockedDomains)
      .values({ domain: blockedHost, reason: "test opt-out" });
    const result = await applyTurkeyStartupCrawlPolicy(db, ids);
    expect(result.paused).toBe(1);
    expect(result.resumed).toBe(1);
    expect(result.reclassified).toBe(1);
    const rows = await db.select().from(sources).where(inArray(sources.id, ids));
    const byId = new Map(rows.map((row) => [row.id, row]));
    expect(byId.get(ids[0]!)?.country).toBe("TR");
    expect(byId.get(ids[1]!)?.status).toBe("unavailable");
    expect(byId.get(ids[2]!)?.status).toBe("delayed");
    for (const id of ids.slice(3)) expect(byId.get(id)?.status).toBe("unavailable");
    expect(rows).toHaveLength(fixtures.length);
    const repeat = await applyTurkeyStartupCrawlPolicy(db, ids);
    expect([repeat.paused, repeat.resumed, repeat.reclassified]).toEqual([0, 0, 0]);
  });

  it("does not let an in-flight crawl overwrite an operator's pause", async () => {
    await markSourceChecked(db, ids[1]!, "healthy");
    const [row] = await db.select().from(sources).where(eq(sources.id, ids[1]!));
    expect(row?.status).toBe("unavailable");
  });
});
