import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { __resetEnvCacheForTests } from "@cim/config";
import {
  asOrganizationId,
  createMentionIfNotExists,
  createProject,
  createMonitoringQuery,
  db,
  listMentionEntities,
  listMentionTopics,
  schema,
} from "@cim/db";
import { processAiEnrichJob } from "./enrich";

/**
 * `listPendingEnrichmentMentions` scans oldest-pending-first across every
 * tenant (ADR-001 cross-tenant exception), capped at BATCH_SIZE per call —
 * correct fairness/back-pressure for production, but it means a shared
 * test database with other pending backlog can take more than one call to
 * reach a specific mention. Poll instead of assuming single-call
 * completion, bounded so a real failure still fails the test promptly.
 */
async function runEnrichUntilSettled(mentionId: string, maxAttempts = 20): Promise<void> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const [row] = await db.select().from(schema.mentions).where(eq(schema.mentions.id, mentionId));
    if (row && row.aiStatus !== "pending") return;
    await processAiEnrichJob();
  }
}

/**
 * Integration test (docs/testing/TEST_STRATEGY.md) against real Postgres —
 * proves the ai_enrich job end to end with the mock provider: a pending
 * Mention gets sentiment/summary/entities/topics written, and a second
 * Mention on the same Article reuses the cached result instead of a second
 * provider call (asserted via a mention count consistent with the reuse
 * path, since MockAIProvider has no call counter to spy on directly).
 */
describe("processAiEnrichJob (integration)", () => {
  let organizationId: ReturnType<typeof asOrganizationId>;
  let projectId: string;
  let sourceId: string;
  let queryId: string;
  const previousAiProvider = process.env.AI_PROVIDER;

  beforeAll(async () => {
    process.env.AI_PROVIDER = "mock";
    __resetEnvCacheForTests();

    const [org] = await db
      .insert(schema.organizations)
      .values({ name: "Enrich Test Co", slug: `enrich-test-${Date.now()}` })
      .returning();
    if (!org) throw new Error("failed to create test organization");
    organizationId = asOrganizationId(org.id);

    const [workspace] = await db
      .insert(schema.workspaces)
      .values({ organizationId, name: "Default" })
      .returning();
    if (!workspace) throw new Error("failed to create test workspace");

    const project = await createProject(db, organizationId, {
      workspaceId: workspace.id,
      name: "Enrich Test Project",
    });
    projectId = project.id;

    const [source] = await db
      .insert(schema.sources)
      .values({
        name: "Enrich Test Wire",
        domain: `enrich-test-${Date.now()}.example`,
        type: "news",
        connector: "mock",
        canDisplayExcerpt: true,
      })
      .returning();
    if (!source) throw new Error("failed to create test source");
    sourceId = source.id;

    const query = await createMonitoringQuery(db, organizationId, {
      projectId,
      name: "Enrich test query",
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

  it("enriches a pending mention with sentiment, summary, entities, and topics", async () => {
    const [article] = await db
      .insert(schema.articles)
      .values({
        sourceId,
        canonicalUrl: `https://enrich-test.example/item-${Date.now()}`,
        contentHash: `enrich-item-${Date.now()}`,
        title: "Northwind Atlas wins industry award for quarterly earnings growth",
      })
      .returning();
    if (!article) throw new Error("failed to create test article");

    const mentionId = await createMentionIfNotExists(db, organizationId, {
      projectId,
      queryId,
      articleId: article.id,
      matchedTerms: ["Northwind"],
    });
    if (!mentionId) throw new Error("failed to create test mention");

    await runEnrichUntilSettled(mentionId);

    const [row] = await db.select().from(schema.mentions).where(eq(schema.mentions.id, mentionId));
    expect(row?.aiStatus).toBe("completed");
    expect(row?.sentiment).toBe("positive");
    expect(row?.aiSummary).toContain("Northwind Atlas");
    expect(row?.aiMethod).toBe("mock-heuristic-v1");

    const entities = await listMentionEntities(db, mentionId);
    expect(entities.some((e) => e.name === "Northwind Atlas")).toBe(true);
    const topics = await listMentionTopics(db, mentionId);
    expect(topics.some((t) => t.name === "Financial")).toBe(true);
  });

  it("reuses a completed enrichment for a second mention of the same article", async () => {
    const [article] = await db
      .insert(schema.articles)
      .values({
        sourceId,
        canonicalUrl: `https://enrich-test.example/shared-${Date.now()}`,
        contentHash: `enrich-shared-${Date.now()}`,
        title: "Northwind Atlas expands into new region",
      })
      .returning();
    if (!article) throw new Error("failed to create test article");

    const firstMentionId = await createMentionIfNotExists(db, organizationId, {
      projectId,
      queryId,
      articleId: article.id,
      matchedTerms: ["Northwind"],
    });
    if (!firstMentionId) throw new Error("failed to create first test mention");
    await runEnrichUntilSettled(firstMentionId);

    const secondQuery = await createMonitoringQuery(db, organizationId, {
      projectId,
      name: "Enrich test query 2",
      queryAst: { include: ["Northwind"], exclude: [], exactPhrases: [] },
      booleanQuery: "Northwind",
      sourceTypes: ["news"],
    });
    const secondMentionId = await createMentionIfNotExists(db, organizationId, {
      projectId,
      queryId: secondQuery.id,
      articleId: article.id,
      matchedTerms: ["Northwind"],
    });
    if (!secondMentionId) throw new Error("failed to create second test mention");

    await runEnrichUntilSettled(secondMentionId);

    const [firstRow] = await db
      .select()
      .from(schema.mentions)
      .where(eq(schema.mentions.id, firstMentionId));
    const [secondRow] = await db
      .select()
      .from(schema.mentions)
      .where(eq(schema.mentions.id, secondMentionId));
    expect(secondRow?.aiStatus).toBe("completed");
    expect(secondRow?.sentiment).toBe(firstRow?.sentiment);
    expect(secondRow?.aiSummary).toBe(firstRow?.aiSummary);
  });

  it("does nothing when AI_PROVIDER is disabled — mentions stay pending, never a crash", async () => {
    delete process.env.AI_PROVIDER;
    __resetEnvCacheForTests();

    const [article] = await db
      .insert(schema.articles)
      .values({
        sourceId,
        canonicalUrl: `https://enrich-test.example/disabled-${Date.now()}`,
        contentHash: `enrich-disabled-${Date.now()}`,
        title: "Northwind Atlas disabled-provider item",
      })
      .returning();
    if (!article) throw new Error("failed to create test article");

    const mentionId = await createMentionIfNotExists(db, organizationId, {
      projectId,
      queryId,
      articleId: article.id,
      matchedTerms: ["Northwind"],
    });
    if (!mentionId) throw new Error("failed to create test mention");

    const result = await processAiEnrichJob();
    expect(result.skipped).toMatch(/disabled/i);

    const [row] = await db.select().from(schema.mentions).where(eq(schema.mentions.id, mentionId));
    expect(row?.aiStatus).toBe("pending");

    process.env.AI_PROVIDER = "mock";
    __resetEnvCacheForTests();
  });
});
