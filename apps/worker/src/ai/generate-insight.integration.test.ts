import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { __resetEnvCacheForTests } from "@cim/config";
import {
  asOrganizationId,
  createMentionIfNotExists,
  createProject,
  createMonitoringQuery,
  db,
  getLatestInsight,
  getLatestInsightForOrganization,
  listLatestRecommendationsForOrganization,
  schema,
} from "@cim/db";
import { processInsightGenerateJob } from "./generate-insight";

describe("processInsightGenerateJob (integration)", () => {
  let organizationId: ReturnType<typeof asOrganizationId>;
  let workspaceId: string;
  let projectId: string;
  let sourceId: string;
  let queryId: string;
  const previousAiProvider = process.env.AI_PROVIDER;

  beforeAll(async () => {
    process.env.AI_PROVIDER = "mock";
    __resetEnvCacheForTests();

    const [org] = await db
      .insert(schema.organizations)
      .values({ name: "Insight Job Test Co", slug: `insight-job-test-${Date.now()}` })
      .returning();
    if (!org) throw new Error("failed to create test organization");
    organizationId = asOrganizationId(org.id);

    const [workspace] = await db
      .insert(schema.workspaces)
      .values({ organizationId, name: "Default" })
      .returning();
    if (!workspace) throw new Error("failed to create test workspace");
    workspaceId = workspace.id;

    const project = await createProject(db, organizationId, {
      workspaceId,
      name: "Insight Job Test Project",
    });
    projectId = project.id;

    const [source] = await db
      .insert(schema.sources)
      .values({
        name: "Insight Job Test Wire",
        domain: `insight-job-test-${Date.now()}.example`,
        type: "news",
        connector: "mock",
        canDisplayExcerpt: true,
      })
      .returning();
    if (!source) throw new Error("failed to create test source");
    sourceId = source.id;

    const query = await createMonitoringQuery(db, organizationId, {
      projectId,
      name: "Insight job test query",
      queryAst: { include: ["Northwind"], exclude: [], exactPhrases: [] },
      booleanQuery: "Northwind",
      sourceTypes: ["news"],
    });
    queryId = query.id;
  });

  afterAll(async () => {
    await db.delete(schema.organizations).where(eq(schema.organizations.id, organizationId));
    await db.delete(schema.sources).where(eq(schema.sources.id, sourceId));
    if (previousAiProvider === undefined) delete process.env.AI_PROVIDER;
    else process.env.AI_PROVIDER = previousAiProvider;
    __resetEnvCacheForTests();
  });

  it("generates a grounded 'what changed' insight for a project with new mentions", async () => {
    const [article] = await db
      .insert(schema.articles)
      .values({
        sourceId,
        canonicalUrl: `https://insight-job-test.example/item-${Date.now()}`,
        contentHash: `insight-job-item-${Date.now()}`,
        title: "Northwind Atlas quarterly results",
      })
      .returning();
    if (!article) throw new Error("failed to create test article");

    const mentionId = await createMentionIfNotExists(db, organizationId, {
      projectId,
      queryId,
      articleId: article.id,
      matchedTerms: ["Northwind"],
      priority: "high",
    });
    if (!mentionId) throw new Error("failed to create test mention");

    const result = await processInsightGenerateJob();
    expect(result.generated).toBeGreaterThan(0);

    const latest = await getLatestInsight(db, organizationId, projectId, "whats_changed");
    expect(latest).toBeDefined();
    expect(latest?.evidence.some((e) => e.mentionId === mentionId)).toBe(true);
    expect(latest?.method).toBe("mock-heuristic-v1");
  });

  it("also generates a recommendation when the mock provider's heuristic finds one, sharing the insight's mention window", async () => {
    const recProject = await createProject(db, organizationId, {
      workspaceId,
      name: "Recommendation Job Test Project",
    });
    const recQuery = await createMonitoringQuery(db, organizationId, {
      projectId: recProject.id,
      name: "Recommendation job test query",
      queryAst: { include: ["Southgate"], exclude: [], exactPhrases: [] },
      booleanQuery: "Southgate",
      sourceTypes: ["news"],
    });

    // Two negative mentions clears MockAIProvider.generateRecommendations's
    // "negative.length >= 2" floor (packages/ai/src/mock-provider.ts).
    for (const i of [0, 1]) {
      const [article] = await db
        .insert(schema.articles)
        .values({
          sourceId,
          canonicalUrl: `https://insight-job-test.example/negative-${Date.now()}-${i}`,
          contentHash: `insight-job-negative-${Date.now()}-${i}`,
          title: `Southgate recall item ${i}`,
        })
        .returning();
      if (!article) throw new Error("failed to create test article");
      // createMentionIfNotExists has no sentiment param (real classification
      // happens later, via ai_enrich) — set it directly, same as the alert
      // engine's sentiment-shift integration test does.
      await db.insert(schema.mentions).values({
        organizationId,
        projectId: recProject.id,
        queryId: recQuery.id,
        articleId: article.id,
        matchedTerms: ["Southgate"],
        sentiment: "negative",
      });
    }

    await processInsightGenerateJob();

    const recommendations = await listLatestRecommendationsForOrganization(db, organizationId, {
      projectId: recProject.id,
    });
    expect(recommendations.length).toBeGreaterThan(0);
    const negativeRec = recommendations.find((r) => r.summary.includes("negative coverage"));
    expect(negativeRec).toBeDefined();
    expect(negativeRec?.why).toMatch(/2 of the 2 mentions/);
    expect(negativeRec?.priority).toBe("medium");
    expect(negativeRec?.evidence.length).toBe(2);
  });

  it("also generates a risk insight when the mock provider's heuristic flags one, storing the level in priority", async () => {
    const riskProject = await createProject(db, organizationId, {
      workspaceId,
      name: "Risk Job Test Project",
    });
    const riskQuery = await createMonitoringQuery(db, organizationId, {
      projectId: riskProject.id,
      name: "Risk job test query",
      queryAst: { include: ["Eastfield"], exclude: [], exactPhrases: [] },
      booleanQuery: "Eastfield",
      sourceTypes: ["news"],
    });

    // 3 of 4 negative clears MockAIProvider.detectRisk's "high" threshold
    // (ratio >= 0.6 && negative.length >= 3, packages/ai/src/mock-provider.ts).
    const sentiments: ("negative" | "positive")[] = ["negative", "negative", "negative", "positive"];
    for (const [i, sentiment] of sentiments.entries()) {
      const [article] = await db
        .insert(schema.articles)
        .values({
          sourceId,
          canonicalUrl: `https://insight-job-test.example/risk-${Date.now()}-${i}`,
          contentHash: `insight-job-risk-${Date.now()}-${i}`,
          title: `Eastfield coverage item ${i}`,
        })
        .returning();
      if (!article) throw new Error("failed to create test article");
      await db.insert(schema.mentions).values({
        organizationId,
        projectId: riskProject.id,
        queryId: riskQuery.id,
        articleId: article.id,
        matchedTerms: ["Eastfield"],
        sentiment,
      });
    }

    await processInsightGenerateJob();

    const risk = await getLatestInsightForOrganization(db, organizationId, "risk", {
      projectId: riskProject.id,
    });
    expect(risk).toBeDefined();
    expect(risk?.priority).toBe("high");
    expect(risk?.evidence.length).toBe(3);
    expect(risk?.method).toBe("mock-heuristic-v1");
  });

  it("generates nothing for a project with no mentions in the period, never a fabricated summary", async () => {
    const emptyProject = await createProject(db, organizationId, {
      workspaceId,
      name: "Empty Insight Project",
    });
    await createMonitoringQuery(db, organizationId, {
      projectId: emptyProject.id,
      name: "Empty project query",
      queryAst: { include: ["NothingEverMatchesThis"], exclude: [], exactPhrases: [] },
      booleanQuery: "NothingEverMatchesThis",
      sourceTypes: ["news"],
    });

    await processInsightGenerateJob();

    const latest = await getLatestInsight(db, organizationId, emptyProject.id, "whats_changed");
    expect(latest).toBeUndefined();
  });
});
