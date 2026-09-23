import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../client";
import { sources } from "../schema/content";
import { listActiveSources, markSourceChecked } from "./sources";

/**
 * Integration test (docs/testing/TEST_STRATEGY.md) against real Postgres
 * — proves listActiveSources includes every status a source can recover
 * from (delayed/error/blocked, all reachable from a single transient
 * healthCheck outcome) and excludes only "unavailable" (no connector
 * registered — retrying can never fix this until code changes).
 * Regression: this repository previously filtered to status = "healthy"
 * only, and nothing else in the codebase ever sets a source back to
 * "healthy", so a single bad healthCheck permanently stopped crawling it.
 */
describe("listActiveSources (integration)", () => {
  const sourceIds: string[] = [];

  async function makeSource(name: string) {
    const [source] = await db
      .insert(sources)
      .values({
        name,
        domain: `list-active-sources-${Date.now()}-${Math.random().toString(36).slice(2)}.example`,
        type: "news",
        connector: "mock",
      })
      .returning();
    if (!source) throw new Error(`failed to create test source "${name}"`);
    sourceIds.push(source.id);
    return source.id;
  }

  afterAll(async () => {
    for (const id of sourceIds) {
      await db.delete(sources).where(eq(sources.id, id));
    }
  });

  it("still lists a source after a single failed healthCheck, instead of excluding it forever", async () => {
    const healthyId = await makeSource("List Active Sources — Healthy");
    const delayedId = await makeSource("List Active Sources — Delayed");
    const errorId = await makeSource("List Active Sources — Error");
    const blockedId = await makeSource("List Active Sources — Blocked");
    const unavailableId = await makeSource("List Active Sources — Unavailable");

    await markSourceChecked(db, delayedId, "delayed");
    await markSourceChecked(db, errorId, "error");
    await markSourceChecked(db, blockedId, "blocked");
    await markSourceChecked(db, unavailableId, "unavailable");

    const active = await listActiveSources(db);
    const activeIds = active.map((s) => s.id);

    expect(activeIds).toContain(healthyId);
    expect(activeIds).toContain(delayedId);
    expect(activeIds).toContain(errorId);
    expect(activeIds).toContain(blockedId);
    // "unavailable" means no connector is registered for this source's
    // connector type — retrying achieves nothing until code changes.
    expect(activeIds).not.toContain(unavailableId);
  });
});
