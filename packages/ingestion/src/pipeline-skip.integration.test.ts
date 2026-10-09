import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { asOrganizationId, createMonitoringQuery, createProject, db, listActiveMonitoringQueriesForSourceType, schema } from "@cim/db";
import type { Source } from "@cim/db/schema";
import type { RawFetchResult, SourceConnector } from "./connector";
import { crawlSignature, itemKey } from "./crawl-memory";
import { ingestSource } from "./pipeline";

/**
 * A crawl that remembers which stories of a feed it already handled (apps/worker crawl-source.ts) passes them to
 * ingestSource as `skipKeys`: they are not looked up, matched or counted again. These tests pin what is skipped, what is
 * not, and that the monitorings' signature changes when a monitoring is added (the signal the worker uses to look at the
 * whole feed again).
 */
describe("ingestSource — remembered stories (integration)", () => {
  const stamp = Date.now();
  let organizationId: ReturnType<typeof asOrganizationId>;
  let projectId: string;
  let source: Source;
  const story = (n: number): RawFetchResult => ({
    externalId: `skip-${stamp}-${n}`,
    canonicalUrl: `https://skip-${stamp}.example/story/${n}`,
    title: `Zorluklu Marka ${stamp} haberi ${n}`,
    bodyText: `Zorluklu Marka ${stamp} hakkinda ${n}. haber metni.`,
    language: "tr",
    publishedAt: new Date(),
  });
  const feed = (items: RawFetchResult[]): SourceConnector => ({
    fetch: async () => items,
    healthCheck: async () => ({ status: "healthy" }),
  });

  beforeAll(async () => {
    const [org] = await db.insert(schema.organizations).values({ name: "Skip Test Co", slug: `skip-test-${stamp}` }).returning();
    organizationId = asOrganizationId(org!.id);
    const [workspace] = await db.insert(schema.workspaces).values({ organizationId, name: "Default" }).returning();
    const project = await createProject(db, organizationId, { workspaceId: workspace!.id, name: "Skip Test Project" });
    projectId = project.id;
    const [row] = await db
      .insert(schema.sources)
      .values({ name: "Skip Test Wire", domain: `skip-${stamp}.example`, type: "news", connector: "mock", status: "healthy", canDisplayExcerpt: true })
      .returning();
    source = row!;
    await createMonitoringQuery(db, organizationId, {
      projectId,
      name: "Skip test query",
      queryAst: { include: [`Zorluklu Marka ${stamp}`], exclude: [], exactPhrases: [] },
      booleanQuery: `Zorluklu Marka ${stamp}`,
      sourceTypes: ["news"],
    });
  });

  afterAll(async () => {
    await db.delete(schema.organizations).where(eq(schema.organizations.id, organizationId));
    await db.delete(schema.sources).where(eq(schema.sources.id, source.id));
  });

  it("leaves remembered stories alone, and processes only the ones it has not seen", async () => {
    const first = await ingestSource(db, source, feed([story(1), story(2), story(3)]));
    expect(first).toMatchObject({ itemsFetched: 3, itemsSkipped: 0, articlesCreated: 3, mentionsCreated: 3 });
    expect(first.itemKeys).toEqual([1, 2, 3].map((n) => itemKey(story(n).canonicalUrl)));

    const quiet = await ingestSource(db, source, feed([story(1), story(2), story(3)]), { skipKeys: new Set(first.itemKeys) });
    expect(quiet).toMatchObject({ itemsFetched: 3, itemsSkipped: 3, articlesCreated: 0, mentionsCreated: 0 });
    expect(quiet.itemKeys).toEqual(first.itemKeys);

    const oneNew = await ingestSource(db, source, feed([story(4), story(1), story(2), story(3)]), { skipKeys: new Set(first.itemKeys) });
    expect(oneNew).toMatchObject({ itemsFetched: 4, itemsSkipped: 3, articlesCreated: 1, mentionsCreated: 1 });
  });

  it("without the memory a monitoring added later gets the stories already stored — which is why its signature differs", async () => {
    const before = await listActiveMonitoringQueriesForSourceType(db, "news");
    const signatureBefore = crawlSignature(source, before);
    await createMonitoringQuery(db, organizationId, {
      projectId,
      name: "Second skip test query",
      queryAst: { include: ["haber"], exclude: [], exactPhrases: [] },
      booleanQuery: "haber",
      sourceTypes: ["news"],
    });
    const after = await listActiveMonitoringQueriesForSourceType(db, "news");
    expect(crawlSignature(source, after)).not.toBe(signatureBefore);
    expect(crawlSignature(source, after)).toBe(crawlSignature(source, [...after].reverse())); // order does not matter
    expect(crawlSignature({ ...source, country: "TR" }, after)).not.toBe(crawlSignature(source, after)); // nor does the source stay the same

    // the whole feed read again (no skipKeys): the new monitoring picks the stored stories up
    const again = await ingestSource(db, source, feed([story(1), story(2)]), { activeQueries: after });
    expect(again).toMatchObject({ itemsSkipped: 0, articlesCreated: 0 });
    expect(again.mentionsCreated).toBeGreaterThanOrEqual(2);
  });
});
