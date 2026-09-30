import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../client";
import { articles, mentions, sources } from "../schema/content";
import { organizations, workspaces } from "../schema/index";
import { createProject } from "./projects";
import { createMonitoringQuery } from "./monitoring-queries";
import { createMentionIfNotExists } from "./mentions";
import {
  addMentionEntity,
  addMentionTopic,
  copyMentionEnrichmentAssignments,
  findCompletedEnrichmentForArticle,
  findOrCreateEntity,
  findOrCreateTopic,
  listMentionEntities,
  listMentionTopics,
  listPendingEnrichmentMentions,
  markMentionEnrichmentCompleted,
  markMentionEnrichmentSkipped,
} from "./ai";
import { asOrganizationId } from "./tenant-scope";
import { entities, entityAliases } from "../schema/ai";

/**
 * Integration test (docs/testing/TEST_STRATEGY.md) against real Postgres —
 * proves entity/topic dedup, the pending-enrichment scan, and the
 * content-hash-based reuse of a completed enrichment across mentions of
 * the same Article (AI_ARCHITECTURE.md cost control).
 */
describe("ai repository (integration)", () => {
  let organizationId: ReturnType<typeof asOrganizationId>;
  let projectId: string;
  let sourceId: string;
  let queryId: string;

  beforeAll(async () => {
    const [org] = await db
      .insert(organizations)
      .values({ name: "AI Test Co", slug: `ai-test-${Date.now()}` })
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
      name: "AI Test Project",
    });
    projectId = project.id;

    const [source] = await db
      .insert(sources)
      .values({
        name: "AI Test Wire",
        domain: `ai-test-${Date.now()}.example`,
        type: "news",
        connector: "mock",
        canDisplayExcerpt: true,
      })
      .returning();
    if (!source) throw new Error("failed to create test source");
    sourceId = source.id;

    const query = await createMonitoringQuery(db, organizationId, {
      projectId,
      name: "AI test query",
      queryAst: { include: ["Northwind"], exclude: [], exactPhrases: [] },
      booleanQuery: "Northwind",
      sourceTypes: ["news"],
    });
    queryId = query.id;
  });

  afterAll(async () => {
    await db.delete(organizations).where(eq(organizations.id, organizationId));
    await db.delete(sources).where(eq(sources.id, sourceId));
  });

  it("finds an entity by its own name case-insensitively before creating a duplicate", async () => {
    const first = await findOrCreateEntity(db, "Northwind Atlas", "company");
    const second = await findOrCreateEntity(db, "northwind atlas", "company");
    expect(second).toBe(first);
  });

  it("resolves an alias to its canonical entity instead of creating a new one", async () => {
    const canonical = await findOrCreateEntity(db, "Northwind Atlas Inc", "company");
    await db.insert(entityAliases).values({ entityId: canonical, alias: "NWA" });

    const resolved = await findOrCreateEntity(db, "NWA", "company");
    expect(resolved).toBe(canonical);

    const [row] = await db.select().from(entities).where(eq(entities.id, resolved));
    expect(row?.name).toBe("Northwind Atlas Inc");
  });

  it("finds a topic by name case-insensitively before creating a duplicate", async () => {
    const first = await findOrCreateTopic(db, "Product Launch");
    const second = await findOrCreateTopic(db, "product launch");
    expect(second).toBe(first);
  });

  it("scans pending enrichment across the mention it just created", async () => {
    const [article] = await db
      .insert(articles)
      .values({
        sourceId,
        canonicalUrl: `https://ai-test.example/pending-${Date.now()}`,
        contentHash: `pending-${Date.now()}`,
        title: "Northwind Atlas pending item",
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

    const pending = await listPendingEnrichmentMentions(db, 200);
    expect(pending.some((p) => p.mentionId === mentionId)).toBe(true);

    await markMentionEnrichmentCompleted(db, mentionId, {
      sentiment: "positive",
      sentimentConfidence: 0.8,
      aiSummary: "Test summary.",
      aiMethod: "mock-heuristic-v1",
    });

    const pendingAfter = await listPendingEnrichmentMentions(db, 200);
    expect(pendingAfter.some((p) => p.mentionId === mentionId)).toBe(false);
  });

  it("reuses a completed enrichment for a second mention of the same article, and copies its entity/topic assignments", async () => {
    const [article] = await db
      .insert(articles)
      .values({
        sourceId,
        canonicalUrl: `https://ai-test.example/shared-${Date.now()}`,
        contentHash: `shared-${Date.now()}`,
        title: "Northwind Atlas shared item",
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

    await markMentionEnrichmentCompleted(db, firstMentionId, {
      sentiment: "negative",
      sentimentConfidence: 0.7,
      aiSummary: "Shared summary.",
      aiMethod: "mock-heuristic-v1",
    });
    const entityId = await findOrCreateEntity(db, "Northwind Atlas", "company");
    await addMentionEntity(db, firstMentionId, entityId, 0.9);
    const topicId = await findOrCreateTopic(db, "Product Launch");
    await addMentionTopic(db, firstMentionId, topicId, 0.6);

    // A second query on the same article (a distinct query row) produces a
    // second Mention for the same Article — this is what the content-hash
    // cache fast-path is for.
    const secondQuery = await createMonitoringQuery(db, organizationId, {
      projectId,
      name: "AI test query 2",
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

    const cached = await findCompletedEnrichmentForArticle(db, article.id);
    expect(cached?.sentiment).toBe("negative");
    expect(cached?.aiSummary).toBe("Shared summary.");

    await copyMentionEnrichmentAssignments(db, firstMentionId, secondMentionId);
    const copiedEntities = await listMentionEntities(db, secondMentionId);
    const copiedTopics = await listMentionTopics(db, secondMentionId);
    expect(copiedEntities.map((e) => e.name)).toContain("Northwind Atlas");
    expect(copiedTopics.map((t) => t.name)).toContain("Product Launch");
  });

  it("marks enrichment skipped for a source whose SourcePolicy forbids AI processing", async () => {
    const [restrictedSource] = await db
      .insert(sources)
      .values({
        name: "No-AI Wire",
        domain: `no-ai-${Date.now()}.example`,
        type: "news",
        connector: "mock",
        canProcessAi: false,
      })
      .returning();
    if (!restrictedSource) throw new Error("failed to create restricted source");

    const [article] = await db
      .insert(articles)
      .values({
        sourceId: restrictedSource.id,
        canonicalUrl: `https://ai-test.example/restricted-${Date.now()}`,
        contentHash: `restricted-${Date.now()}`,
        title: "Northwind Atlas restricted item",
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

    const pending = await listPendingEnrichmentMentions(db, 200);
    const candidate = pending.find((p) => p.mentionId === mentionId);
    expect(candidate?.sourceCanProcessAi).toBe(false);

    await markMentionEnrichmentSkipped(db, mentionId);
    const [row] = await db.select().from(mentions).where(eq(mentions.id, mentionId));
    expect(row?.aiStatus).toBe("skipped");

    await db.delete(sources).where(eq(sources.id, restrictedSource.id));
  });
});
