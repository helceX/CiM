import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../client";
import { articles, mentions, sources } from "../schema/content";
import { organizations, workspaces } from "../schema/index";
import { createProject } from "./projects";
import { createMonitoringQuery } from "./monitoring-queries";
import {
  getMentionVolumeSeries,
  getSentimentTrendSeries,
  getSourceDistribution,
  getTopicBreakdown,
} from "./analytics";
import { asOrganizationId } from "./tenant-scope";

describe("analytics repository (integration)", () => {
  let organizationId: ReturnType<typeof asOrganizationId>;
  let queryId: string;
  let sourceAId: string;
  let sourceBId: string;

  beforeAll(async () => {
    const [org] = await db
      .insert(organizations)
      .values({ name: "Analytics Test Co", slug: `analytics-test-${Date.now()}` })
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
      name: "Analytics Test Project",
    });

    const query = await createMonitoringQuery(db, organizationId, {
      projectId: project.id,
      name: "Analytics test query",
      queryAst: { include: ["test"], exclude: [], exactPhrases: [] },
      booleanQuery: "test",
      sourceTypes: ["news"],
    });
    queryId = query.id;

    const [sourceA] = await db
      .insert(sources)
      .values({ name: "Source A", domain: `source-a-${Date.now()}.example`, type: "news", connector: "mock" })
      .returning();
    const [sourceB] = await db
      .insert(sources)
      .values({ name: "Source B", domain: `source-b-${Date.now()}.example`, type: "news", connector: "mock" })
      .returning();
    if (!sourceA || !sourceB) throw new Error("failed to create test sources");
    sourceAId = sourceA.id;
    sourceBId = sourceB.id;

    // 2 mentions from Source A (1 positive, 1 negative), 1 from Source B (neutral),
    // all created "now" — falls inside any sinceDays window we test with.
    const mentionDefs = [
      { sourceId: sourceAId, sentiment: "positive" as const },
      { sourceId: sourceAId, sentiment: "negative" as const },
      { sourceId: sourceBId, sentiment: "neutral" as const },
    ];
    for (const [i, def] of mentionDefs.entries()) {
      const [article] = await db
        .insert(articles)
        .values({
          sourceId: def.sourceId,
          canonicalUrl: `https://analytics-test.example/${i}`,
          contentHash: `analytics-test-hash-${i}`,
          title: `Analytics test article ${i}`,
        })
        .returning();
      if (!article) throw new Error("failed to create test article");
      await db.insert(mentions).values({
        organizationId,
        projectId: project.id,
        queryId,
        articleId: article.id,
        matchedTerms: ["test"],
        sentiment: def.sentiment,
      });
    }
  });

  afterAll(async () => {
    await db.delete(organizations).where(eq(organizations.id, organizationId));
    await db.delete(sources).where(eq(sources.id, sourceAId));
    await db.delete(sources).where(eq(sources.id, sourceBId));
  });

  it("zero-fills the mention volume series across the whole window", async () => {
    const series = await getMentionVolumeSeries(db, organizationId, { sinceDays: 7 });
    // 7 days ago through today, inclusive.
    expect(series.length).toBe(8);
    const total = series.reduce((sum, point) => sum + point.count, 0);
    expect(total).toBe(3);
    // Today's bucket holds every mention we just created.
    expect(series[series.length - 1]?.count).toBe(3);
  });

  it("breaks the sentiment trend into positive/neutral/negative/unclassified buckets", async () => {
    const series = await getSentimentTrendSeries(db, organizationId, { sinceDays: 1 });
    const today = series[series.length - 1];
    expect(today?.positive).toBe(1);
    expect(today?.negative).toBe(1);
    expect(today?.neutral).toBe(1);
    expect(today?.unclassified).toBe(0);
  });

  it("ranks source distribution by mention count", async () => {
    const distribution = await getSourceDistribution(db, organizationId, { sinceDays: 7 });
    expect(distribution[0]).toEqual({ sourceName: "Source A", count: 2 });
    expect(distribution[1]).toEqual({ sourceName: "Source B", count: 1 });
  });

  it("reports topic (monitoring query) breakdown with a previous-period bucket", async () => {
    const topics = await getTopicBreakdown(db, organizationId, { sinceDays: 7 });
    const topic = topics.find((t) => t.queryId === queryId);
    expect(topic?.currentCount).toBe(3);
    expect(topic?.previousCount).toBe(0);
  });

  it("never mixes another organization's data into any analytics query", async () => {
    const otherOrgId = asOrganizationId("00000000-0000-0000-0000-000000000000");
    const [volume, distribution, topics] = await Promise.all([
      getMentionVolumeSeries(db, otherOrgId, { sinceDays: 7 }),
      getSourceDistribution(db, otherOrgId, { sinceDays: 7 }),
      getTopicBreakdown(db, otherOrgId, { sinceDays: 7 }),
    ]);
    expect(volume.every((point) => point.count === 0)).toBe(true);
    expect(distribution).toHaveLength(0);
    expect(topics).toHaveLength(0);
  });
});
