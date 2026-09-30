import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  asOrganizationId,
  createMonitoringQuery,
  createProject,
  db,
  schema,
  upsertRetentionPolicy,
} from "@cim/db";
import { processEnforceRetentionJob } from "./enforce-retention";

/**
 * Integration test (docs/testing/TEST_STRATEGY.md) against real Postgres
 * — proves the daily retention-enforcement tick deletes only Mentions
 * past their organization's configured window, and leaves a keep-forever
 * organization (no policy row / null mentionRetentionDays) completely
 * untouched — the P2 counterpart to Phase 14's policy-configuration-only
 * MVP scope (docs/product/FEATURE_MATRIX.md "Enforcement worker").
 */
describe("processEnforceRetentionJob (integration)", () => {
  let orgWithPolicyId: ReturnType<typeof asOrganizationId>;
  let orgKeepForeverId: ReturnType<typeof asOrganizationId>;
  let sourceId: string;

  beforeAll(async () => {
    const [orgWithPolicy] = await db
      .insert(schema.organizations)
      .values({
        name: "Enforce Retention Job Co",
        slug: `enforce-retention-job-${Date.now()}`,
      })
      .returning();
    const [orgKeepForever] = await db
      .insert(schema.organizations)
      .values({
        name: "Enforce Retention Job Keep-Forever Co",
        slug: `enforce-retention-job-keep-${Date.now()}`,
      })
      .returning();
    if (!orgWithPolicy || !orgKeepForever)
      throw new Error("failed to create test organizations");
    orgWithPolicyId = asOrganizationId(orgWithPolicy.id);
    orgKeepForeverId = asOrganizationId(orgKeepForever.id);

    await upsertRetentionPolicy(db, orgWithPolicyId, { mentionRetentionDays: 30 });

    const [source] = await db
      .insert(schema.sources)
      .values({
        name: "Enforce Retention Job Wire",
        domain: `enforce-retention-job-${Date.now()}.example`,
        type: "news",
        connector: "mock",
        canDisplayExcerpt: true,
      })
      .returning();
    if (!source) throw new Error("failed to create test source");
    sourceId = source.id;

    const [article] = await db
      .insert(schema.articles)
      .values({
        sourceId,
        canonicalUrl: `https://enforce-retention-job.example/item-${Date.now()}`,
        contentHash: `enforce-retention-job-item-${Date.now()}`,
        title: "Expired article",
      })
      .returning();
    if (!article) throw new Error("failed to create test article");

    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

    for (const organizationId of [orgWithPolicyId, orgKeepForeverId]) {
      const [workspace] = await db
        .insert(schema.workspaces)
        .values({ organizationId, name: "Default" })
        .returning();
      if (!workspace) throw new Error("failed to create test workspace");

      const project = await createProject(db, organizationId, {
        workspaceId: workspace.id,
        name: "Enforce Retention Job Project",
      });

      const query = await createMonitoringQuery(db, organizationId, {
        projectId: project.id,
        name: "Enforce retention job query",
        queryAst: { include: ["Northwind"], exclude: [], exactPhrases: [] },
        booleanQuery: "Northwind",
        sourceTypes: ["news"],
      });

      await db.insert(schema.mentions).values({
        organizationId,
        projectId: project.id,
        queryId: query.id,
        articleId: article.id,
        matchedTerms: ["Northwind"],
        createdAt: sixtyDaysAgo,
      });
    }
  });

  // getOrganizationsWithRetentionPolicy is cross-tenant by design — leave
  // no organization behind, the same lesson as every other cross-tenant
  // scheduler-tick test in this suite (reports/digest integration tests).
  afterAll(async () => {
    await db
      .delete(schema.organizations)
      .where(eq(schema.organizations.id, orgWithPolicyId));
    await db
      .delete(schema.organizations)
      .where(eq(schema.organizations.id, orgKeepForeverId));
    await db.delete(schema.sources).where(eq(schema.sources.id, sourceId));
  });

  it("deletes expired mentions for an organization with a configured policy, leaving keep-forever orgs untouched", async () => {
    await processEnforceRetentionJob();

    const withPolicyMentions = await db
      .select()
      .from(schema.mentions)
      .where(eq(schema.mentions.organizationId, orgWithPolicyId));
    expect(withPolicyMentions).toHaveLength(0);

    const keepForeverMentions = await db
      .select()
      .from(schema.mentions)
      .where(eq(schema.mentions.organizationId, orgKeepForeverId));
    expect(keepForeverMentions).toHaveLength(1);
  });
});
