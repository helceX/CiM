import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../client";
import { articles, sources } from "../schema/content";
import { organizations, workspaces } from "../schema/index";
import { createProject } from "./projects";
import { createMonitoringQuery } from "./monitoring-queries";
import { createMentionIfNotExists } from "./mentions";
import { createInsight, getLatestInsight, listMentionsForInsightPeriod } from "./insights";
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
});
