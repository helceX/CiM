import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../client";
import { articles, mentions, sources } from "../schema/content";
import { organizations, workspaces } from "../schema/index";
import { createProject } from "./projects";
import { createMonitoringQuery } from "./monitoring-queries";
import { createMentionIfNotExists } from "./mentions";
import {
  createInsight,
  getLatestInsight,
  listLatestRecommendationsForOrganization,
  listMentionsForInsightPeriod,
  listRecentMentionsForAssistant,
} from "./insights";
import { asOrganizationId } from "./tenant-scope";

describe("insights repository (integration)", () => {
  let organizationId: ReturnType<typeof asOrganizationId>;
  let projectId: string;
  let sourceId: string;
  let queryId: string;
  let mentionId: string;

  beforeAll(async () => {
    const [org] = await db
      .insert(organizations)
      .values({ name: "Insight Test Co", slug: `insight-test-${Date.now()}` })
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
      name: "Insight Test Project",
    });
    projectId = project.id;

    const [source] = await db
      .insert(sources)
      .values({
        name: "Insight Test Wire",
        domain: `insight-test-${Date.now()}.example`,
        type: "news",
        connector: "mock",
        canDisplayExcerpt: true,
      })
      .returning();
    if (!source) throw new Error("failed to create test source");
    sourceId = source.id;

    const query = await createMonitoringQuery(db, organizationId, {
      projectId,
      name: "Insight test query",
      queryAst: { include: ["Northwind"], exclude: [], exactPhrases: [] },
      booleanQuery: "Northwind",
      sourceTypes: ["news"],
    });
    queryId = query.id;

    const [article] = await db
      .insert(articles)
      .values({
        sourceId,
        canonicalUrl: `https://insight-test.example/item-${Date.now()}`,
        contentHash: `insight-item-${Date.now()}`,
        title: "Northwind Atlas quarterly results",
      })
      .returning();
    if (!article) throw new Error("failed to create test article");

    const createdMentionId = await createMentionIfNotExists(db, organizationId, {
      projectId,
      queryId,
      articleId: article.id,
      matchedTerms: ["Northwind"],
      priority: "high",
    });
    if (!createdMentionId) throw new Error("failed to create test mention");
    mentionId = createdMentionId;
  });

  afterAll(async () => {
    await db.delete(organizations).where(eq(organizations.id, organizationId));
    await db.delete(sources).where(eq(sources.id, sourceId));
  });

  it("lists mentions within the requested period, ordered by priority", async () => {
    const rows = await listMentionsForInsightPeriod(db, organizationId, projectId, 24);
    expect(rows.some((r) => r.id === mentionId)).toBe(true);
    expect(rows.find((r) => r.id === mentionId)?.priority).toBe("high");
  });

  it("excludes mentions outside the requested period", async () => {
    const rows = await listMentionsForInsightPeriod(db, organizationId, projectId, 0);
    expect(rows.some((r) => r.id === mentionId)).toBe(false);
  });

  it("caps to the highest-severity mentions under a tight limit, not alphabetical order", async () => {
    // "normal" sorts after "critical" alphabetically, so a plain text
    // DESC sort would rank it first and drop the critical mention under
    // a limit of 1 — exactly backwards from the "expensive synthesis
    // reserved for what will actually surface" cost-control intent this
    // limit exists for.
    const [normalArticle] = await db
      .insert(articles)
      .values({
        sourceId,
        canonicalUrl: `https://insight-test.example/normal-${Date.now()}`,
        contentHash: `insight-normal-${Date.now()}`,
        title: "Northwind Atlas routine update",
      })
      .returning();
    if (!normalArticle) throw new Error("failed to create normal-priority article");
    await createMentionIfNotExists(db, organizationId, {
      projectId,
      queryId,
      articleId: normalArticle.id,
      matchedTerms: ["Northwind"],
      priority: "normal",
    });

    const [criticalArticle] = await db
      .insert(articles)
      .values({
        sourceId,
        canonicalUrl: `https://insight-test.example/critical-${Date.now()}`,
        contentHash: `insight-critical-${Date.now()}`,
        title: "Northwind Atlas facing a real crisis",
      })
      .returning();
    if (!criticalArticle) throw new Error("failed to create critical-priority article");
    const criticalMentionId = await createMentionIfNotExists(db, organizationId, {
      projectId,
      queryId,
      articleId: criticalArticle.id,
      matchedTerms: ["Northwind"],
      priority: "critical",
    });

    const rows = await listMentionsForInsightPeriod(db, organizationId, projectId, 24, 1);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(criticalMentionId);
    expect(rows[0]?.priority).toBe("critical");
  });

  it("never grounds a generated insight/recommendation/risk with a mention the user already dismissed as irrelevant/duplicate", async () => {
    // Regression: a mention the user marked irrelevant/duplicate
    // (setMentionFeedback -> status "archived") must not come back as
    // grounding evidence here either — the same exclusion
    // listRecentMentionsForAssistant already applies for the AI Assistant.
    await db.update(mentions).set({ status: "archived" }).where(eq(mentions.id, mentionId));
    try {
      const rows = await listMentionsForInsightPeriod(db, organizationId, projectId, 24);
      expect(rows.some((r) => r.id === mentionId)).toBe(false);
    } finally {
      await db.update(mentions).set({ status: "new" }).where(eq(mentions.id, mentionId));
    }
  });

  it("creates a grounded insight with evidence and reads it back as the latest for its kind", async () => {
    const periodStart = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const periodEnd = new Date();

    await createInsight(db, organizationId, {
      projectId,
      kind: "whats_changed",
      summary: "1 new mention — 1 high-priority match.",
      confidence: 0.9,
      method: "mock-heuristic-v1",
      periodStart,
      periodEnd,
      evidenceMentionIds: [mentionId],
    });

    const latest = await getLatestInsight(db, organizationId, projectId, "whats_changed");
    expect(latest?.summary).toBe("1 new mention — 1 high-priority match.");
    expect(latest?.evidence).toHaveLength(1);
    expect(latest?.evidence[0]?.mentionId).toBe(mentionId);
  });

  it("returns undefined when no insight of that kind exists yet, never a fabricated placeholder", async () => {
    const latest = await getLatestInsight(db, organizationId, projectId, "risk");
    expect(latest).toBeUndefined();
  });

  it("round-trips a risk-kind insight's level through the reused priority column, with why left null", async () => {
    const periodStart = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const periodEnd = new Date();

    await createInsight(db, organizationId, {
      projectId,
      kind: "risk",
      summary: "3 of 4 mentions carried negative sentiment.",
      priority: "high",
      confidence: 0.65,
      method: "mock-heuristic-v1",
      periodStart,
      periodEnd,
      evidenceMentionIds: [mentionId],
    });

    const latest = await getLatestInsight(db, organizationId, projectId, "risk");
    expect(latest?.priority).toBe("high");
    expect(latest?.why).toBeNull();
    expect(latest?.evidence).toHaveLength(1);
  });

  it("grounds the AI Assistant with the org's recent mentions regardless of age", async () => {
    const rows = await listRecentMentionsForAssistant(db, organizationId);
    expect(rows.some((r) => r.id === mentionId)).toBe(true);
  });

  it("never grounds the AI Assistant with another organization's mentions", async () => {
    const otherOrgId = asOrganizationId("00000000-0000-0000-0000-000000000000");
    const rows = await listRecentMentionsForAssistant(db, otherOrgId);
    expect(rows.some((r) => r.id === mentionId)).toBe(false);
  });

  it("never grounds the AI Assistant with a mention the user already dismissed as irrelevant/duplicate", async () => {
    // Regression: a mention the user marked irrelevant/duplicate
    // (setMentionFeedback -> status "archived") must not come back as
    // evidence in an assistant answer — the same default exclusion
    // mentionFiltersToWhere already applies for the Mentions table.
    await db.update(mentions).set({ status: "archived" }).where(eq(mentions.id, mentionId));
    try {
      const rows = await listRecentMentionsForAssistant(db, organizationId);
      expect(rows.some((r) => r.id === mentionId)).toBe(false);
    } finally {
      await db.update(mentions).set({ status: "new" }).where(eq(mentions.id, mentionId));
    }
  });

  it("returns every recommendation from the latest batch, with why/priority, and never an older batch", async () => {
    const olderPeriodEnd = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await createInsight(db, organizationId, {
      projectId,
      kind: "recommendation",
      summary: "Stale recommendation from an earlier run.",
      why: "Old evidence.",
      priority: "low",
      confidence: 0.5,
      method: "mock-heuristic-v1",
      periodStart: new Date(olderPeriodEnd.getTime() - 24 * 60 * 60 * 1000),
      periodEnd: olderPeriodEnd,
      evidenceMentionIds: [mentionId],
    });

    const latestPeriodEnd = new Date();
    const latestPeriodStart = new Date(latestPeriodEnd.getTime() - 24 * 60 * 60 * 1000);
    await createInsight(db, organizationId, {
      projectId,
      kind: "recommendation",
      summary: "Prepare a response to the recent negative coverage.",
      why: "2 of the 3 mentions carried negative sentiment.",
      priority: "high",
      confidence: 0.7,
      method: "mock-heuristic-v1",
      periodStart: latestPeriodStart,
      periodEnd: latestPeriodEnd,
      evidenceMentionIds: [mentionId],
    });
    await createInsight(db, organizationId, {
      projectId,
      kind: "recommendation",
      summary: "Review the high-priority mentions.",
      why: "1 mention matched a high-relevance rule.",
      priority: "medium",
      confidence: 0.65,
      method: "mock-heuristic-v1",
      periodStart: latestPeriodStart,
      periodEnd: latestPeriodEnd,
      evidenceMentionIds: [mentionId],
    });

    const latestBatch = await listLatestRecommendationsForOrganization(db, organizationId, {
      projectId,
    });
    expect(latestBatch).toHaveLength(2);
    expect(latestBatch.some((r) => r.summary.includes("Stale"))).toBe(false);
    // Ordering must be by actual severity ("high" before "medium"), not
    // alphabetical — "medium" sorts before "high" alphabetically, which
    // is exactly backwards.
    expect(latestBatch[0]?.priority).toBe("high");
    expect(latestBatch[1]?.priority).toBe("medium");
    const highPriority = latestBatch.find((r) => r.priority === "high");
    expect(highPriority?.why).toBe("2 of the 3 mentions carried negative sentiment.");
    expect(highPriority?.evidence).toHaveLength(1);
    expect(highPriority?.evidence[0]?.mentionId).toBe(mentionId);
  });

  it("returns an empty list when no recommendation has ever been generated, never a fabricated placeholder", async () => {
    const otherOrgId = asOrganizationId("00000000-0000-0000-0000-000000000000");
    const rows = await listLatestRecommendationsForOrganization(db, otherOrgId);
    expect(rows).toEqual([]);
  });
});
