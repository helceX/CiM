import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../client";
import { articles, mentions, sources } from "../schema/content";
import { organizations, workspaces } from "../schema/index";
import { createProject } from "./projects";
import { createMonitoringQuery } from "./monitoring-queries";
import {
  getMentionDetail,
  listMentionsFiltered,
  setMentionFeedback,
} from "./mentions";
import { asOrganizationId } from "./tenant-scope";

/**
 * Integration test (docs/testing/TEST_STRATEGY.md) against a real
 * Postgres instance — proves the Mentions table's filtering, pagination,
 * detail lookup, and feedback recording actually work together, not just
 * that each query compiles.
 */
describe("mentions repository (integration)", () => {
  let organizationId: ReturnType<typeof asOrganizationId>;
  let projectId: string;
  let sourceId: string;
  let queryId: string;
  const mentionIds: string[] = [];

  beforeAll(async () => {
    const [org] = await db
      .insert(organizations)
      .values({ name: "Mentions Test Co", slug: `mentions-test-${Date.now()}` })
      .returning();
    if (!org) throw new Error("failed to create test organization");
    organizationId = asOrganizationId(org.id);

    const [workspace] = await db
      .insert(workspaces)
      .values({ organizationId, name: "Default" })
      .returning();
    if (!workspace) throw new Error("failed to create test workspace");

    const project = await createProject(db, organizationId, {
      workspaceId: workspace.id,
      name: "Mentions Test Project",
    });
    projectId = project.id;

    const [source] = await db
      .insert(sources)
      .values({
        name: "Mentions Test Wire",
        domain: `mentions-test-${Date.now()}.example`,
        type: "news",
        connector: "mock",
        canDisplayExcerpt: true,
      })
      .returning();
    if (!source) throw new Error("failed to create test source");
    sourceId = source.id;

    const query = await createMonitoringQuery(db, organizationId, {
      projectId,
      name: "Mentions test query",
      queryAst: { include: ["test"], exclude: [], exactPhrases: [] },
      booleanQuery: "test",
      sourceTypes: ["news"],
    });
    queryId = query.id;

    const seedArticles = [
      { title: "Positive story about the brand", sentiment: "positive" as const, priority: "high" as const },
      { title: "Neutral coverage piece", sentiment: "neutral" as const, priority: "normal" as const },
      { title: "Negative press about a recall", sentiment: "negative" as const, priority: "critical" as const },
      { title: "Unclassified mention with no sentiment yet", sentiment: null, priority: "low" as const },
    ];

    for (const [i, def] of seedArticles.entries()) {
      const [article] = await db
        .insert(articles)
        .values({
          sourceId,
          canonicalUrl: `https://mentions-test.example/${i}`,
          contentHash: `mentions-test-hash-${i}`,
          title: def.title,
          publishedAt: new Date(Date.now() - i * 1000),
        })
        .returning();
      if (!article) throw new Error("failed to create test article");

      const [mention] = await db
        .insert(mentions)
        .values({
          organizationId,
          projectId,
          queryId,
          articleId: article.id,
          matchedTerms: ["test"],
          sentiment: def.sentiment,
          priority: def.priority,
        })
        .returning();
      if (!mention) throw new Error("failed to create test mention");
      mentionIds.push(mention.id);
    }
  });

  afterAll(async () => {
    await db.delete(organizations).where(eq(organizations.id, organizationId));
    await db.delete(sources).where(eq(sources.id, sourceId));
  });

  it("filters by sentiment", async () => {
    const result = await listMentionsFiltered(
      db,
      organizationId,
      { sentiment: "negative" },
      { page: 1, pageSize: 10 },
    );
    expect(result.totalCount).toBe(1);
    expect(result.items[0]?.article.title).toContain("recall");
  });

  it("filters unclassified sentiment as null, not a literal string", async () => {
    const result = await listMentionsFiltered(
      db,
      organizationId,
      { sentiment: "unclassified" },
      { page: 1, pageSize: 10 },
    );
    expect(result.totalCount).toBe(1);
    expect(result.items[0]?.mention.sentiment).toBeNull();
  });

  it("filters by priority", async () => {
    const result = await listMentionsFiltered(
      db,
      organizationId,
      { priority: "critical" },
      { page: 1, pageSize: 10 },
    );
    expect(result.totalCount).toBe(1);
  });

  it("searches article titles case-insensitively", async () => {
    const result = await listMentionsFiltered(
      db,
      organizationId,
      { search: "BRAND" },
      { page: 1, pageSize: 10 },
    );
    expect(result.totalCount).toBe(1);
    expect(result.items[0]?.article.title).toContain("brand");
  });

  it("paginates results", async () => {
    const page1 = await listMentionsFiltered(db, organizationId, {}, { page: 1, pageSize: 2 });
    const page2 = await listMentionsFiltered(db, organizationId, {}, { page: 2, pageSize: 2 });
    expect(page1.items).toHaveLength(2);
    expect(page2.items).toHaveLength(2);
    expect(page1.totalCount).toBe(4);
    expect(page1.items[0]?.mention.id).not.toEqual(page2.items[0]?.mention.id);
  });

  it("never returns another organization's mentions", async () => {
    const otherOrgId = asOrganizationId("00000000-0000-0000-0000-000000000000");
    const result = await listMentionsFiltered(db, otherOrgId, {}, { page: 1, pageSize: 10 });
    expect(result.totalCount).toBe(0);
  });

  it("returns full detail including the matched query's name", async () => {
    const mentionId = mentionIds[0];
    if (!mentionId) throw new Error("no seeded mention");
    const detail = await getMentionDetail(db, organizationId, mentionId);
    expect(detail?.queryName).toBe("Mentions test query");
    expect(detail?.mention.matchedTerms).toContain("test");
  });

  it("records feedback and moves the mention out of the new/reviewed queue when irrelevant", async () => {
    const mentionId = mentionIds[1];
    if (!mentionId) throw new Error("no seeded mention");
    const updated = await setMentionFeedback(db, organizationId, mentionId, "irrelevant");
    expect(updated).toBe(true);

    const [row] = await db.select().from(mentions).where(eq(mentions.id, mentionId));
    expect(row?.reviewFeedback).toBe("irrelevant");
    expect(row?.status).toBe("archived");

    const defaultView = await listMentionsFiltered(db, organizationId, {}, { page: 1, pageSize: 10 });
    expect(defaultView.items.some((item) => item.mention.id === mentionId)).toBe(false);

    const withArchived = await listMentionsFiltered(
      db,
      organizationId,
      { includeArchived: true },
      { page: 1, pageSize: 10 },
    );
    expect(withArchived.items.some((item) => item.mention.id === mentionId)).toBe(true);
  });

  it("does not let feedback be recorded against another organization's mention", async () => {
    const mentionId = mentionIds[2];
    if (!mentionId) throw new Error("no seeded mention");
    const otherOrgId = asOrganizationId("00000000-0000-0000-0000-000000000000");
    const updated = await setMentionFeedback(db, otherOrgId, mentionId, "relevant");
    expect(updated).toBe(false);
  });
});
