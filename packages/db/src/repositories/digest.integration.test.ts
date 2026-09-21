import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../client";
import { articles, mentions, sources } from "../schema/content";
import { organizations, projects, workspaces } from "../schema/index";
import { createMonitoringQuery } from "./monitoring-queries";
import { asOrganizationId } from "./tenant-scope";
import { getDigestSummaryForOrganization, listActiveOrganizationIdsForDigest } from "./digest";

describe("digest repository (integration)", () => {
  let activeOrgId: ReturnType<typeof asOrganizationId>;
  let deletedOrgId: ReturnType<typeof asOrganizationId>;
  let sourceId: string;
  let projectId: string;
  let queryId: string;

  beforeAll(async () => {
    const [activeOrg] = await db
      .insert(organizations)
      .values({ name: "Digest Active Org", slug: `digest-active-${Date.now()}` })
      .returning();
    const [deletedOrg] = await db
      .insert(organizations)
      .values({ name: "Digest Deleted Org", slug: `digest-deleted-${Date.now()}`, deletedAt: new Date() })
      .returning();
    if (!activeOrg || !deletedOrg) throw new Error("failed to create test organizations");
    activeOrgId = asOrganizationId(activeOrg.id);
    deletedOrgId = asOrganizationId(deletedOrg.id);

    const [workspace] = await db
      .insert(workspaces)
      .values({ organizationId: activeOrgId, name: "Default" })
      .returning();
    if (!workspace) throw new Error("failed to create test workspace");

    const project = await db
      .insert(projects)
      .values({ organizationId: activeOrgId, workspaceId: workspace.id, name: "Digest Project" })
      .returning();
    if (!project[0]) throw new Error("failed to create test project");
    projectId = project[0].id;

    const query = await createMonitoringQuery(db, activeOrgId, {
      projectId,
      name: "Digest query",
      queryAst: { include: ["Northwind"], exclude: [], exactPhrases: [] },
      booleanQuery: "Northwind",
      sourceTypes: ["news"],
    });
    queryId = query.id;

    const [source] = await db
      .insert(sources)
      .values({
        name: "Digest Wire",
        domain: `digest-wire-${Date.now()}.example`,
        type: "news",
        connector: "mock",
        canDisplayExcerpt: true,
      })
      .returning();
    if (!source) throw new Error("failed to create test source");
    sourceId = source.id;

    const now = new Date();
    const within24h = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    const outside24h = new Date(now.getTime() - 30 * 60 * 60 * 1000);

    const fixtures: { title: string; sentiment: string | null; priority: string; createdAt: Date }[] = [
      { title: "Recent normal", sentiment: "positive", priority: "normal", createdAt: within24h },
      { title: "Recent critical", sentiment: "negative", priority: "critical", createdAt: within24h },
      { title: "Recent unclassified", sentiment: null, priority: "low", createdAt: within24h },
      { title: "Too old to count", sentiment: "positive", priority: "critical", createdAt: outside24h },
    ];

    for (const fixture of fixtures) {
      const [article] = await db
        .insert(articles)
        .values({
          sourceId,
          canonicalUrl: `https://digest-wire.example/${fixture.title.replace(/\s+/g, "-")}-${Date.now()}-${Math.random()}`,
          contentHash: `digest-${fixture.title}-${Date.now()}-${Math.random()}`,
          title: fixture.title,
        })
        .returning();
      if (!article) throw new Error("failed to create test article");

      await db.insert(mentions).values({
        organizationId: activeOrgId,
        projectId,
        queryId,
        articleId: article.id,
        matchedTerms: ["Northwind"],
        sentiment: fixture.sentiment,
        priority: fixture.priority,
        createdAt: fixture.createdAt,
      });
    }
  });

  afterAll(async () => {
    await db.delete(organizations).where(eq(organizations.id, activeOrgId));
    await db.delete(organizations).where(eq(organizations.id, deletedOrgId));
    await db.delete(sources).where(eq(sources.id, sourceId));
  });

  it("excludes a soft-deleted organization from the digest fan-out scan", async () => {
    const ids = await listActiveOrganizationIdsForDigest(db);
    expect(ids).toContain(activeOrgId);
    expect(ids).not.toContain(deletedOrgId);
  });

  it("counts only mentions within the window and classifies sentiment", async () => {
    const summary = await getDigestSummaryForOrganization(db, activeOrgId, 24, 5);
    expect(summary.totalNewMentions).toBe(3);
    expect(summary.sentimentCounts).toEqual({ positive: 1, neutral: 0, negative: 1, unclassified: 1 });
  });

  it("orders top mentions by severity, not alphabetically by priority string", async () => {
    const summary = await getDigestSummaryForOrganization(db, activeOrgId, 24, 5);
    expect(summary.topMentions[0]?.title).toBe("Recent critical");
  });

  it("returns zero for an organization with no recent mentions", async () => {
    const [emptyOrg] = await db
      .insert(organizations)
      .values({ name: "Digest Empty Org", slug: `digest-empty-${Date.now()}` })
      .returning();
    if (!emptyOrg) throw new Error("failed to create test organization");
    try {
      const summary = await getDigestSummaryForOrganization(db, asOrganizationId(emptyOrg.id), 24, 5);
      expect(summary.totalNewMentions).toBe(0);
      expect(summary.topMentions).toEqual([]);
    } finally {
      await db.delete(organizations).where(eq(organizations.id, emptyOrg.id));
    }
  });
});
