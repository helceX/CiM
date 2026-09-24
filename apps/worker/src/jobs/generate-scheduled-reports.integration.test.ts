import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import type { Queue } from "bullmq";
import type { GenerateReportJobData } from "@cim/core";
import {
  asOrganizationId,
  createProject,
  createReport,
  db,
  getReport,
  schema,
  updateReportSchedule,
} from "@cim/db";
import { processGenerateScheduledReportsJob } from "./generate-scheduled-reports";

/**
 * Integration test (docs/testing/TEST_STRATEGY.md) against real Postgres
 * — proves the scheduled-reports tick enqueues a real ReportRun through
 * the same generateReportQueue an on-demand "Run again" click uses, and
 * advances lastScheduledRunAt so the same report doesn't fire again on
 * the next tick.
 */
describe("processGenerateScheduledReportsJob (integration)", () => {
  let organizationId: ReturnType<typeof asOrganizationId>;
  let projectId: string;
  let userId: string;

  beforeAll(async () => {
    const [org] = await db
      .insert(schema.organizations)
      .values({
        name: "Scheduled Report Job Test Co",
        slug: `scheduled-report-job-test-${Date.now()}`,
      })
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
      name: "Scheduled Report Job Test Project",
    });
    projectId = project.id;

    const [user] = await db
      .insert(schema.users)
      .values({
        email: `scheduled-report-job-test-${Date.now()}@example.com`,
        passwordHash: "unused-in-this-test",
        firstName: "Scheduled",
        lastName: "Tester",
        emailVerifiedAt: new Date(),
      })
      .returning();
    if (!user) throw new Error("failed to create test user");
    userId = user.id;
  });

  // getReportsDueForScheduledRun is cross-tenant by design — leaving a
  // scheduled report behind here would leak into every other test
  // sharing this database, the same reason reports.integration.test.ts
  // cleans up after itself.
  afterAll(async () => {
    await db
      .delete(schema.organizations)
      .where(eq(schema.organizations.id, organizationId));
  });

  it("enqueues a real generation job and advances lastScheduledRunAt for each due report", async () => {
    const report = await createReport(db, organizationId, {
      projectId,
      createdByUserId: userId,
      name: `Weekly scheduled report ${Date.now()}`,
      templateKey: "weekly_summary",
      periodType: "rolling_7d",
    });
    await updateReportSchedule(db, organizationId, report.id, "weekly");

    const addSpy = vi.fn().mockResolvedValue(undefined);
    const fakeQueue = { add: addSpy } as unknown as Queue<GenerateReportJobData>;

    await processGenerateScheduledReportsJob(fakeQueue);

    expect(addSpy).toHaveBeenCalledTimes(1);
    const [, jobData] = addSpy.mock.calls[0] as [string, GenerateReportJobData];
    expect(jobData.reportRunId).toBeTruthy();

    const [run] = await db
      .select()
      .from(schema.reportRuns)
      .where(eq(schema.reportRuns.id, jobData.reportRunId));
    expect(run?.reportId).toBe(report.id);
    expect(run?.requestedByUserId).toBe(userId);

    const updated = await getReport(db, organizationId, report.id);
    expect(updated?.lastScheduledRunAt).toBeTruthy();
  });

  it("does not enqueue anything for a report whose schedule is 'none'", async () => {
    await createReport(db, organizationId, {
      projectId,
      createdByUserId: userId,
      name: `On-demand-only report ${Date.now()}`,
      templateKey: "weekly_summary",
      periodType: "rolling_7d",
    });

    const addSpy = vi.fn().mockResolvedValue(undefined);
    const fakeQueue = { add: addSpy } as unknown as Queue<GenerateReportJobData>;

    await processGenerateScheduledReportsJob(fakeQueue);

    expect(addSpy).not.toHaveBeenCalled();
  });
});
