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
