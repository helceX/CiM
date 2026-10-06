import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../client";
import { articles, mentions, sources } from "../schema/content";
import { organizations, workspaces } from "../schema/organizations";
import { createProject } from "./projects";
import { createMonitoringQuery } from "./monitoring-queries";
import { createMentionIfNotExists } from "./mentions";
import { getDatabaseSizeBytes, listLargestTables, pruneArticles, pruneOrphanArticles, previewPrune } from "./storage";
import { asOrganizationId } from "./tenant-scope";

describe("storage (integration)", () => {
  const stamp = Date.now();
  let sourceId: string;
  let organizationId: ReturnType<typeof asOrganizationId>;

  beforeAll(async () => {
    const [source] = await db
      .insert(sources)
      .values({ name: `Storage ${stamp}`, domain: `storage-${stamp}.example`, type: "news", connector: "mock" })
      .returning();
    sourceId = source!.id;
    const [org] = await db.insert(organizations).values({ name: "Storage Co", slug: `storage-${stamp}` }).returning();
    organizationId = asOrganizationId(org!.id);
    const [ws] = await db.insert(workspaces).values({ organizationId, name: "Default" }).returning();
    const project = await createProject(db, organizationId, { workspaceId: ws!.id, name: "P" });

    const oldDate = new Date(Date.now() - 45 * 86_400_000);
    const rows = await db
      .insert(articles)
      .values([
        { sourceId, canonicalUrl: `https://s.example/${stamp}/old-orphan`, contentHash: `st-${stamp}-1`, title: "old orphan", createdAt: oldDate },
        { sourceId, canonicalUrl: `https://s.example/${stamp}/old-matched`, contentHash: `st-${stamp}-2`, title: "old matched", createdAt: oldDate },
        { sourceId, canonicalUrl: `https://s.example/${stamp}/new-orphan`, contentHash: `st-${stamp}-3`, title: "new orphan" },
      ])
      .returning();
    const query = await createMonitoringQuery(db, organizationId, {
      projectId: project.id,
      name: "q",
      queryAst: { include: ["x"], exclude: [], exactPhrases: [] },
      booleanQuery: "x",
      sourceTypes: ["news"],
    });
    await createMentionIfNotExists(db, organizationId, {
      projectId: project.id,
      queryId: query.id,
      articleId: rows[1]!.id,
      matchedTerms: ["x"],
    });
  });

  afterAll(async () => {
    await db.delete(sources).where(eq(sources.id, sourceId));
    await db.delete(organizations).where(eq(organizations.id, organizationId));
  });

  it("deletes only old stories nobody's monitoring matched", async () => {
    await pruneOrphanArticles(db, { olderThanDays: 30 });
    const left = await db.select({ title: articles.title }).from(articles).where(eq(articles.sourceId, sourceId));
    expect(left.map((r) => r.title).sort()).toEqual(["new orphan", "old matched"]);
    const kept = await db.select().from(mentions).where(eq(mentions.organizationId, organizationId));
    expect(kept).toHaveLength(1);
  });

  it("previews, then deletes on request: unmatched only, or matched ones (and their mentions) too", async () => {
    const before = await previewPrune(db, 0);
    expect(before.unmatchedStories).toBeGreaterThanOrEqual(1); // the new orphan
    expect(before.matchedStories).toBeGreaterThanOrEqual(1);
    expect(before.mentions).toBeGreaterThanOrEqual(1);

    await pruneArticles(db, { olderThanDays: 0, includeMatched: false });
    let left = await db.select({ title: articles.title }).from(articles).where(eq(articles.sourceId, sourceId));
    expect(left.map((r) => r.title)).toEqual(["old matched"]); // matched stories survive the safe form

    await pruneArticles(db, { olderThanDays: 0, includeMatched: true });
    left = await db.select({ title: articles.title }).from(articles).where(eq(articles.sourceId, sourceId));
    expect(left).toEqual([]);
    expect(await db.select().from(mentions).where(eq(mentions.organizationId, organizationId))).toHaveLength(0);
  });

  it("reports the database size and the biggest tables", async () => {
    expect(await getDatabaseSizeBytes(db)).toBeGreaterThan(1_000_000);
    const tables = await listLargestTables(db, 5);
    expect(tables.length).toBeGreaterThan(0);
    expect(tables[0]!.bytes).toBeGreaterThanOrEqual(tables[tables.length - 1]!.bytes);
  });
});
