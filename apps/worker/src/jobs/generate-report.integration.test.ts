import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Job } from "bullmq";
import type { GenerateReportJobData } from "@cim/core";
import {
  asOrganizationId,
  countUnreadNotifications,
  createMentionIfNotExists,
  createProject,
  createMonitoringQuery,
  createReport,
  createReportRun,
  db,
  getReportFile,
  getReportRun,
  listNotifications,
  schema,
} from "@cim/db";
import { processGenerateReportJob } from "./generate-report";

function fakeJob(reportRunId: string): Job<GenerateReportJobData> {
  return { data: { reportRunId } } as Job<GenerateReportJobData>;
}

/**
 * Integration test (docs/testing/TEST_STRATEGY.md) against real Postgres
 * — proves the generate_report job end to end: gathers real tenant data,
 * renders an actual PDF via headless Chromium and a CSV, stores both, and
 * notifies the requesting user.
 */
describe("processGenerateReportJob (integration)", () => {
  let organizationId: ReturnType<typeof asOrganizationId>;
  let projectId: string;
  let userId: string;
  let sourceId: string;

  beforeAll(async () => {
    const [org] = await db
      .insert(schema.organizations)
      .values({ name: "Report Test Co", slug: `report-test-${Date.now()}` })
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
      name: "Report Test Project",
    });
    projectId = project.id;

    const [user] = await db
      .insert(schema.users)
      .values({
        email: `report-test-${Date.now()}@example.com`,
        passwordHash: "unused-in-this-test",
        firstName: "Report",
        lastName: "Tester",
        emailVerifiedAt: new Date(),
      })
      .returning();
    if (!user) throw new Error("failed to create test user");
    userId = user.id;

    await db.insert(schema.organizationMemberships).values({
      organizationId,
      userId,
      role: "organization_owner",
      status: "active",
    });

    const [source] = await db
      .insert(schema.sources)
      .values({
        name: "Report Test Wire",
        domain: `report-test-${Date.now()}.example`,
        type: "news",
        connector: "mock",
        canDisplayExcerpt: true,
      })
      .returning();
    if (!source) throw new Error("failed to create test source");
    sourceId = source.id;

    const query = await createMonitoringQuery(db, organizationId, {
      projectId,
      name: "Report test query",
      queryAst: { include: ["Northwind"], exclude: [], exactPhrases: [] },
      booleanQuery: "Northwind",
      sourceTypes: ["news"],
    });

    const [article] = await db
      .insert(schema.articles)
      .values({
        sourceId,
        canonicalUrl: `https://report-test.example/item-${Date.now()}`,
        contentHash: `report-item-${Date.now()}`,
        title: "Northwind Atlas quarterly results",
      })
      .returning();
    if (!article) throw new Error("failed to create test article");

    await createMentionIfNotExists(db, organizationId, {
      projectId,
      queryId: query.id,
      articleId: article.id,
      matchedTerms: ["Northwind"],
    });
  });

  afterAll(async () => {
    await db
      .delete(schema.organizations)
      .where(eq(schema.organizations.id, organizationId));
    await db.delete(schema.sources).where(eq(schema.sources.id, sourceId));
  });

  it("generates PDF and CSV output for a completed run and notifies the requester", async () => {
    const report = await createReport(db, organizationId, {
      projectId,
      createdByUserId: userId,
      name: "Weekly Summary — smoke test",
      templateKey: "weekly_summary",
      periodType: "rolling_7d",
    });
    const run = await createReportRun(db, organizationId, {
      reportId: report.id,
      requestedByUserId: userId,
      periodStart: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      periodEnd: new Date(),
    });

    await processGenerateReportJob(fakeJob(run.id));

    const updatedRun = await getReportRun(db, organizationId, run.id);
    expect(updatedRun?.status).toBe("completed");

    const pdfFile = await getReportFile(db, run.id, "pdf");
    expect(pdfFile).toBeDefined();
    expect(pdfFile?.data.subarray(0, 5).toString("ascii")).toBe("%PDF-");

    const csvFile = await getReportFile(db, run.id, "csv");
    expect(csvFile).toBeDefined();
    expect(csvFile?.data.toString("utf-8")).toContain(
      "Northwind Atlas quarterly results",
    );

    const xlsxFile = await getReportFile(db, run.id, "xlsx");
    expect(xlsxFile).toBeDefined();
    // The xlsx format's zip container starts with the "PK" local-file-
    // header signature — a lightweight proof this is a real workbook,
    // not an empty or truncated buffer.
    expect(xlsxFile?.data.subarray(0, 2).toString("ascii")).toBe("PK");

    const notifications = await listNotifications(db, organizationId, userId, {
      limit: 10,
    });
    expect(notifications.some((n) => n.body.includes("ready to download"))).toBe(true);
  }, 30_000);

  it("marks the run failed with a real error and notifies the requester, never a silently missing report", async () => {
    const report = await createReport(db, organizationId, {
      projectId,
      createdByUserId: userId,
      name: "Broken template report",
      templateKey: "does_not_exist",
      periodType: "rolling_7d",
    });
    const run = await createReportRun(db, organizationId, {
      reportId: report.id,
      requestedByUserId: userId,
      periodStart: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      periodEnd: new Date(),
    });

    const unreadBefore = await countUnreadNotifications(db, organizationId, userId);
    await processGenerateReportJob(fakeJob(run.id));

    const updatedRun = await getReportRun(db, organizationId, run.id);
    expect(updatedRun?.status).toBe("failed");
    expect(updatedRun?.error).toBeTruthy();

    const unreadAfter = await countUnreadNotifications(db, organizationId, userId);
    expect(unreadAfter).toBe(unreadBefore + 1);
  }, 30_000);
});
