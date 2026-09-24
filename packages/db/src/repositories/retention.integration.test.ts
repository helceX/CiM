import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../client";
import { articles, mentions, sources } from "../schema/content";
import { organizations, workspaces } from "../schema/organizations";
import { asOrganizationId } from "./tenant-scope";
import { createMonitoringQuery } from "./monitoring-queries";
import { createProject } from "./projects";
import {
  deleteExpiredMentions,
  getOrganizationsWithRetentionPolicy,
  getRetentionPolicy,
  upsertRetentionPolicy,
} from "./retention";

describe("retention repository (integration)", () => {
  let organizationId: ReturnType<typeof asOrganizationId>;

  beforeAll(async () => {
    const [org] = await db
      .insert(organizations)
      .values({ name: "Retention Test Org", slug: `retention-test-${Date.now()}` })
      .returning();
    if (!org) throw new Error("failed to create test organization");
    organizationId = asOrganizationId(org.id);
  });

  it("defaults to keep-forever when no policy row exists", async () => {
    const policy = await getRetentionPolicy(db, organizationId);
    expect(policy).toEqual({ mentionRetentionDays: null });
  });

  it("creates a policy row on first configure and reads it back", async () => {
    await upsertRetentionPolicy(db, organizationId, { mentionRetentionDays: 90 });

    const policy = await getRetentionPolicy(db, organizationId);
    expect(policy).toEqual({ mentionRetentionDays: 90 });
  });

  it("updates the existing row in place rather than creating a second one", async () => {
    await upsertRetentionPolicy(db, organizationId, { mentionRetentionDays: 90 });
    await upsertRetentionPolicy(db, organizationId, { mentionRetentionDays: 365 });

    const policy = await getRetentionPolicy(db, organizationId);
    expect(policy).toEqual({ mentionRetentionDays: 365 });
  });

  it("can be set back to keep-forever", async () => {
    await upsertRetentionPolicy(db, organizationId, { mentionRetentionDays: 90 });
    await upsertRetentionPolicy(db, organizationId, { mentionRetentionDays: null });

    const policy = await getRetentionPolicy(db, organizationId);
    expect(policy).toEqual({ mentionRetentionDays: null });
  });
});

/**
 * getOrganizationsWithRetentionPolicy is deliberately cross-tenant
 * (ADR-001's documented exception, same shape as
 * listActiveOrganizationIdsForDigest) — an org left behind here with a
 * non-null policy would leak into every other test's exact-count
 * assertions, so both test organizations are torn down in afterAll,
 * mirroring the lesson from reports.integration.test.ts.
 */
describe("data retention enforcement (integration)", () => {
  let orgWithPolicyId: ReturnType<typeof asOrganizationId>;
  let orgKeepForeverId: ReturnType<typeof asOrganizationId>;
  let sourceId: string;
  let expiredArticleId: string;
  let recentArticleId: string;

  beforeAll(async () => {
    const [orgWithPolicy] = await db
      .insert(organizations)
      .values({ name: "Retention Enforce Co", slug: `retention-enforce-${Date.now()}` })
      .returning();
    const [orgKeepForever] = await db
      .insert(organizations)
      .values({
        name: "Retention Enforce Keep-Forever Co",
        slug: `retention-enforce-keep-${Date.now()}`,
      })
      .returning();
    if (!orgWithPolicy || !orgKeepForever)
      throw new Error("failed to create test organizations");
    orgWithPolicyId = asOrganizationId(orgWithPolicy.id);
    orgKeepForeverId = asOrganizationId(orgKeepForever.id);

    await upsertRetentionPolicy(db, orgWithPolicyId, { mentionRetentionDays: 30 });
    // No policy row at all for orgKeepForeverId — the MVP default, same as
    // an org that has never visited Settings.

    const [source] = await db
      .insert(sources)
      .values({
        name: "Retention Enforce Wire",
        domain: `retention-enforce-${Date.now()}.example`,
        type: "news",
        connector: "mock",
        canDisplayExcerpt: true,
      })
      .returning();
    if (!source) throw new Error("failed to create test source");
    sourceId = source.id;

    const [expiredArticle] = await db
      .insert(articles)
      .values({
        sourceId,
        canonicalUrl: `https://retention-enforce.example/expired-${Date.now()}`,
        contentHash: `retention-enforce-expired-${Date.now()}`,
        title: "Expired article",
      })
      .returning();
    const [recentArticle] = await db
      .insert(articles)
      .values({
        sourceId,
        canonicalUrl: `https://retention-enforce.example/recent-${Date.now()}`,
        contentHash: `retention-enforce-recent-${Date.now()}`,
        title: "Recent article",
      })
      .returning();
    if (!expiredArticle || !recentArticle)
      throw new Error("failed to create test articles");
    expiredArticleId = expiredArticle.id;
    recentArticleId = recentArticle.id;

    for (const [organizationId, orgLabel] of [
      [orgWithPolicyId, "policy"],
      [orgKeepForeverId, "keep-forever"],
    ] as const) {
      const [workspace] = await db
        .insert(workspaces)
        .values({ organizationId, name: "Default" })
        .returning();
      if (!workspace) throw new Error("failed to create test workspace");

      const project = await createProject(db, organizationId, {
        workspaceId: workspace.id,
        name: `Retention Enforce Project (${orgLabel})`,
      });

      const query = await createMonitoringQuery(db, organizationId, {
        projectId: project.id,
        name: `Retention enforce query (${orgLabel})`,
        queryAst: { include: ["Northwind"], exclude: [], exactPhrases: [] },
        booleanQuery: "Northwind",
        sourceTypes: ["news"],
      });

      const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
      const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);

      await db.insert(mentions).values([
        {
          organizationId,
          projectId: project.id,
          queryId: query.id,
          articleId: expiredArticleId,
          matchedTerms: ["Northwind"],
          createdAt: sixtyDaysAgo,
        },
        {
          organizationId,
          projectId: project.id,
          queryId: query.id,
          articleId: recentArticleId,
          matchedTerms: ["Northwind"],
          createdAt: fiveDaysAgo,
        },
      ]);
    }
  });

  afterAll(async () => {
    await db.delete(organizations).where(eq(organizations.id, orgWithPolicyId));
    await db.delete(organizations).where(eq(organizations.id, orgKeepForeverId));
    await db.delete(sources).where(eq(sources.id, sourceId));
  });

  it("returns only organizations with a configured (non-null) retention window", async () => {
    const policies = await getOrganizationsWithRetentionPolicy(db);

    const ours = policies.filter((p) =>
      [orgWithPolicyId, orgKeepForeverId].includes(p.organizationId),
    );
    expect(ours).toEqual([
      { organizationId: orgWithPolicyId, mentionRetentionDays: 30 },
    ]);
  });

  it("deletes only mentions older than the retention window for that organization", async () => {
    const deletedCount = await deleteExpiredMentions(db, orgWithPolicyId, 30);
    expect(deletedCount).toBe(1);

    const remaining = await db
      .select({ articleId: mentions.articleId })
      .from(mentions)
      .where(eq(mentions.organizationId, orgWithPolicyId));
    expect(remaining).toEqual([{ articleId: recentArticleId }]);
  });

  it("never touches another organization's mentions, even ones past the same age", async () => {
    await deleteExpiredMentions(db, orgWithPolicyId, 30);

    const keepForeverMentions = await db
      .select({ articleId: mentions.articleId })
      .from(mentions)
      .where(eq(mentions.organizationId, orgKeepForeverId));
    expect(keepForeverMentions).toHaveLength(2);
  });
});
