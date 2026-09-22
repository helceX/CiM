import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../client";
import { articles, mentions, sources } from "../schema/content";
import { organizationMemberships, organizations, workspaces } from "../schema/organizations";
import { reports } from "../schema/reports";
import { subscriptions } from "../schema/billing";
import { users } from "../schema/users";
import { createProject } from "./projects";
import { createMonitoringQuery } from "./monitoring-queries";
import { createMentionIfNotExists } from "./mentions";
import {
  captureFeatureUsageSnapshot,
  getLatestFeatureUsage,
  getSubscription,
  listActiveOrganizationsForUsageCapture,
} from "./billing";
import { asOrganizationId } from "./tenant-scope";

/**
 * Integration test (docs/testing/TEST_STRATEGY.md) against real Postgres
 * — docs/architecture/DATA_MODEL.md "Subscription / FeatureUsage...
 * populated from day one" (FEATURE_MATRIX.md "Billing: Usage counters
 * only", MVP).
 */
describe("billing repository (integration)", () => {
  let organizationId: ReturnType<typeof asOrganizationId>;
  let projectId: string;
  let sourceId: string;
  let userId: string;

  beforeAll(async () => {
    const [org] = await db
      .insert(organizations)
      .values({ name: "Billing Test Co", slug: `billing-test-${Date.now()}` })
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
      name: "Billing Test Project",
    });
    projectId = project.id;

    const [user] = await db
      .insert(users)
      .values({
        email: `billing-test-${Date.now()}@example.com`,
        passwordHash: "unused-in-this-test",
        firstName: "Billing",
        lastName: "Tester",
        emailVerifiedAt: new Date(),
      })
      .returning();
    if (!user) throw new Error("failed to create test user");
    userId = user.id;
    await db.insert(organizationMemberships).values({
      organizationId,
      userId,
      role: "organization_owner",
      status: "active",
    });

    const [source] = await db
      .insert(sources)
      .values({
        name: "Billing Test Wire",
        domain: `billing-test-${Date.now()}.example`,
        type: "news",
        connector: "mock",
        canDisplayExcerpt: true,
      })
      .returning();
    if (!source) throw new Error("failed to create test source");
    sourceId = source.id;

    const query = await createMonitoringQuery(db, organizationId, {
      projectId,
      name: "Billing test query",
      queryAst: { include: ["Northwind"], exclude: [], exactPhrases: [] },
      booleanQuery: "Northwind",
      sourceTypes: ["news"],
    });

    const [article] = await db
      .insert(articles)
      .values({
        sourceId,
        canonicalUrl: `https://billing-test.example/item-${Date.now()}`,
        contentHash: `billing-test-item-${Date.now()}`,
        title: "Northwind Atlas quarterly results",
      })
      .returning();
    if (!article) throw new Error("failed to create test article");

    const mentionId = await createMentionIfNotExists(db, organizationId, {
      projectId,
      queryId: query.id,
      articleId: article.id,
      matchedTerms: ["Northwind"],
    });
    if (!mentionId) throw new Error("failed to create test mention");
    await db.update(mentions).set({ aiStatus: "completed" }).where(eq(mentions.id, mentionId));

    await db.insert(reports).values({
      organizationId,
      projectId,
      createdByUserId: userId,
      name: "Billing test report",
      templateKey: "weekly_summary",
      periodType: "rolling_7d",
    });
  });

  afterAll(async () => {
    await db.delete(organizations).where(eq(organizations.id, organizationId));
    await db.delete(sources).where(eq(sources.id, sourceId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it("defaults an organization with no subscription row to the free plan", async () => {
    const subscription = await getSubscription(db, organizationId);
    expect(subscription.plan).toBe("free");
  });

  it("reads back an explicitly set plan", async () => {
    await db.insert(subscriptions).values({ organizationId, plan: "pro" });
    const subscription = await getSubscription(db, organizationId);
    expect(subscription.plan).toBe("pro");
  });

  it("returns undefined for feature usage before any snapshot has been captured", async () => {
    const usage = await getLatestFeatureUsage(db, organizationId);
    expect(usage).toBeUndefined();
  });

  it("captures a snapshot with real counts from the org's own data", async () => {
    await captureFeatureUsageSnapshot(db, organizationId);

    const usage = await getLatestFeatureUsage(db, organizationId);
    expect(usage).toBeDefined();
    expect(usage?.keywordsCount).toBe(1);
    expect(usage?.sourcesCount).toBe(1);
    expect(usage?.mentionsCount).toBe(1);
    expect(usage?.aiCreditsCount).toBe(1);
    expect(usage?.reportsCount).toBe(1);
    expect(usage?.usersCount).toBe(1);
  });

  it("returns only the most recent snapshot when captured more than once", async () => {
    await captureFeatureUsageSnapshot(db, organizationId);
    const usage = await getLatestFeatureUsage(db, organizationId);
    expect(usage?.mentionsCount).toBe(1);
  });

  it("includes this organization in the cross-tenant capture fan-out", async () => {
    const orgs = await listActiveOrganizationsForUsageCapture(db);
    expect(orgs.some((o) => o.organizationId === organizationId)).toBe(true);
  });
});
