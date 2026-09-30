import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../client";
import { articles, sources } from "../schema/content";
import { organizationMemberships, organizations, users, workspaces } from "../schema/index";
import { createProject, getProject } from "./projects";
import { createMonitoringQuery, getMonitoringQuery } from "./monitoring-queries";
import { createMentionIfNotExists, getMentionDetail, setMentionFeedback } from "./mentions";
import { createReport, createReportRun, getReport, getReportRun } from "./reports";
import { createNotificationForUser, markNotificationRead } from "./notifications";
import { getMembership } from "./memberships";
import { asOrganizationId } from "./tenant-scope";

/**
 * docs/architecture/SECURITY.md + docs/testing/TEST_STRATEGY.md commit to
 * an IDOR suite "across every list & detail API" — this is that suite,
 * at the layer where the actual authorization boundary lives (ADR-001:
 * every tenant-scoped repository function requires organizationId, so
 * this is where a cross-tenant leak would actually happen or be caught).
 * Two independent, fully-populated tenants; every "get/act by id"
 * function is called with tenant B's organizationId but tenant A's
 * entity id, and must refuse — not just filter, refuse (undefined/false/
 * empty), so a route handler that forwards the result never leaks tenant
 * A's row shape either.
 */
describe("tenant isolation / IDOR (integration)", () => {
  let orgAId: ReturnType<typeof asOrganizationId>;
  let orgBId: ReturnType<typeof asOrganizationId>;
  let orgASourceId: string;

  let projectAId: string;
  let queryAId: string;
  let mentionAId: string;
  let reportAId: string;
  let reportRunAId: string;

  let userAId: string;
  let userBId: string;
  let notificationAId: string;

  beforeAll(async () => {
    const [orgA] = await db
      .insert(organizations)
      .values({ name: "Tenant A", slug: `tenant-a-${Date.now()}` })
      .returning();
    const [orgB] = await db
      .insert(organizations)
      .values({ name: "Tenant B", slug: `tenant-b-${Date.now()}` })
      .returning();
    if (!orgA || !orgB) throw new Error("failed to create test organizations");
    orgAId = asOrganizationId(orgA.id);
    orgBId = asOrganizationId(orgB.id);

    const [workspaceA] = await db
      .insert(workspaces)
      .values({ organizationId: orgAId, name: "Default" })
      .returning();
    if (!workspaceA) throw new Error("failed to create test workspace");

    const projectA = await createProject(db, orgAId, {
      workspaceId: workspaceA.id,
      name: "Tenant A Project",
    });
    projectAId = projectA.id;

    const [userA] = await db
      .insert(users)
      .values({
        email: `tenant-a-${Date.now()}@example.com`,
        passwordHash: "unused-in-this-test",
        firstName: "Tenant",
        lastName: "A",
        emailVerifiedAt: new Date(),
      })
      .returning();
    const [userB] = await db
      .insert(users)
      .values({
        email: `tenant-b-${Date.now()}@example.com`,
        passwordHash: "unused-in-this-test",
        firstName: "Tenant",
        lastName: "B",
        emailVerifiedAt: new Date(),
      })
      .returning();
    if (!userA || !userB) throw new Error("failed to create test users");
    userAId = userA.id;
    userBId = userB.id;

    await db
      .insert(organizationMemberships)
      .values({ organizationId: orgAId, userId: userAId, role: "organization_owner", status: "active" });

    const queryA = await createMonitoringQuery(db, orgAId, {
      projectId: projectAId,
      name: "Tenant A query",
      queryAst: { include: ["Tenant A"], exclude: [], exactPhrases: [] },
      booleanQuery: "Tenant A",
      sourceTypes: ["news"],
    });
    queryAId = queryA.id;

    const [source] = await db
      .insert(sources)
      .values({
        name: "Tenant A Wire",
        domain: `tenant-a-${Date.now()}.example`,
        type: "news",
        connector: "mock",
        canDisplayExcerpt: true,
      })
      .returning();
    if (!source) throw new Error("failed to create test source");
    orgASourceId = source.id;

    const [article] = await db
      .insert(articles)
      .values({
        sourceId: orgASourceId,
        canonicalUrl: `https://tenant-a.example/item-${Date.now()}`,
        contentHash: `tenant-a-item-${Date.now()}`,
        title: "Tenant A confidential mention",
      })
      .returning();
    if (!article) throw new Error("failed to create test article");

    const mentionId = await createMentionIfNotExists(db, orgAId, {
      projectId: projectAId,
      queryId: queryAId,
      articleId: article.id,
      matchedTerms: ["Tenant A"],
    });
    if (!mentionId) throw new Error("failed to create test mention");
    mentionAId = mentionId;

    const reportA = await createReport(db, orgAId, {
      projectId: projectAId,
      createdByUserId: userAId,
      name: "Tenant A confidential report",
      templateKey: "weekly_summary",
      periodType: "rolling_7d",
    });
    reportAId = reportA.id;

    const reportRunA = await createReportRun(db, orgAId, {
      reportId: reportAId,
      requestedByUserId: userAId,
      periodStart: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      periodEnd: new Date(),
    });
    reportRunAId = reportRunA.id;

    const notificationA = await createNotificationForUser(db, orgAId, userAId, {
      kind: "system",
      title: "Tenant A confidential notification",
      body: "Should never be readable/markable by tenant B.",
    });
    if (!notificationA) throw new Error("failed to create test notification");
    notificationAId = notificationA.id;
  });

  afterAll(async () => {
    await db.delete(organizations).where(eq(organizations.id, orgAId));
    await db.delete(organizations).where(eq(organizations.id, orgBId));
    await db.delete(sources).where(eq(sources.id, orgASourceId));
  });

  it("refuses a cross-tenant getProject", async () => {
    expect(await getProject(db, orgBId, projectAId)).toBeUndefined();
    expect(await getProject(db, orgAId, projectAId)).toBeDefined();
  });

  it("refuses a cross-tenant getMonitoringQuery", async () => {
    expect(await getMonitoringQuery(db, orgBId, queryAId)).toBeUndefined();
    expect(await getMonitoringQuery(db, orgAId, queryAId)).toBeDefined();
  });

  it("refuses a cross-tenant getMentionDetail", async () => {
    expect(await getMentionDetail(db, orgBId, mentionAId)).toBeUndefined();
    expect(await getMentionDetail(db, orgAId, mentionAId)).toBeDefined();
  });

  it("refuses a cross-tenant setMentionFeedback (no-op, not an error that could leak state)", async () => {
    expect(await setMentionFeedback(db, orgBId, mentionAId, "relevant")).toBe(false);
    const stillUnreviewed = await getMentionDetail(db, orgAId, mentionAId);
    expect(stillUnreviewed?.mention.status).toBe("new");
  });

  it("refuses a cross-tenant getReport and getReportRun", async () => {
    expect(await getReport(db, orgBId, reportAId)).toBeUndefined();
    expect(await getReport(db, orgAId, reportAId)).toBeDefined();
    expect(await getReportRun(db, orgBId, reportRunAId)).toBeUndefined();
    expect(await getReportRun(db, orgAId, reportRunAId)).toBeDefined();
  });

  it("refuses a cross-tenant markNotificationRead (no-op)", async () => {
    expect(await markNotificationRead(db, orgBId, userBId, notificationAId)).toBe(false);
    expect(await markNotificationRead(db, orgAId, userAId, notificationAId)).toBe(true);
  });

  it("refuses a cross-tenant getMembership (user B is not a member of org A)", async () => {
    expect(await getMembership(db, orgAId, userBId)).toBeUndefined();
    expect(await getMembership(db, orgAId, userAId)).toBeDefined();
  });
});
