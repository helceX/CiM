import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { hashToken } from "@cim/core";
import {
  asOrganizationId,
  createProject,
  createReport,
  createReportRun,
  createReportShareLink,
  db,
  getActiveReportShareLink,
  getReportShareLinkByToken,
  getReportsDueForScheduledRun,
  markReportRunCompleted,
  markReportScheduledRun,
  revokeReportShareLinks,
  schema,
  updateReportSchedule,
} from "@cim/db";

describe("reports repository — scheduling (integration)", () => {
  let organizationId: ReturnType<typeof asOrganizationId>;
  let projectId: string;
  let userId: string;

  beforeAll(async () => {
    const [org] = await db
      .insert(schema.organizations)
      .values({
        name: "Scheduled Report Test Co",
        slug: `scheduled-report-test-${Date.now()}`,
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
      name: "Scheduled Report Test Project",
    });
    projectId = project.id;

    const [user] = await db
      .insert(schema.users)
      .values({
        email: `scheduled-report-test-${Date.now()}@example.com`,
        passwordHash: "unused-in-this-test",
        firstName: "Scheduled",
        lastName: "Tester",
        emailVerifiedAt: new Date(),
      })
      .returning();
    if (!user) throw new Error("failed to create test user");
    userId = user.id;
  });

  // getReportsDueForScheduledRun is deliberately cross-tenant (ADR-001's
  // documented exception, same as the digest/spike-alert scans) — a
  // weekly-scheduled report left behind here with no lastScheduledRunAt
  // would stay "due" forever and leak into every other test (this file's
  // own exact-count assertions, and apps/worker's scheduled-reports job
  // test) sharing this database.
  afterAll(async () => {
    await db
      .delete(schema.organizations)
      .where(eq(schema.organizations.id, organizationId));
  });

  async function makeReport() {
    return createReport(db, organizationId, {
      projectId,
      createdByUserId: userId,
      name: `Scheduled report ${Date.now()}-${Math.random()}`,
      templateKey: "weekly_summary",
      periodType: "rolling_7d",
    });
  }

  it("excludes reports whose schedule is 'none'", async () => {
    const report = await makeReport();
    const due = await getReportsDueForScheduledRun(db);
    expect(due.some((r) => r.id === report.id)).toBe(false);
  });

  it("persists a custom template's ordered section list, and leaves it null for a fixed template", async () => {
    const custom = await createReport(db, organizationId, {
      projectId,
      createdByUserId: userId,
      name: `Custom report ${Date.now()}`,
      templateKey: "custom",
      sections: ["competitors", "trend", "ai_insight"],
      periodType: "rolling_7d",
    });
    expect(custom.sections).toEqual(["competitors", "trend", "ai_insight"]);

    const fixed = await makeReport();
    expect(fixed.sections).toBeNull();
  });

  it("includes a scheduled report that has never run before", async () => {
    const report = await makeReport();
    await updateReportSchedule(db, organizationId, report.id, "weekly");

    const due = await getReportsDueForScheduledRun(db);
    expect(due.some((r) => r.id === report.id)).toBe(true);
  });

  it("excludes a weekly report that ran 3 days ago, and includes one that ran 8 days ago", async () => {
    const recentlyRun = await makeReport();
    await updateReportSchedule(db, organizationId, recentlyRun.id, "weekly");
    await db
      .update(schema.reports)
      .set({ lastScheduledRunAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) })
      .where(eq(schema.reports.id, recentlyRun.id));

    const overdue = await makeReport();
    await updateReportSchedule(db, organizationId, overdue.id, "weekly");
    await db
      .update(schema.reports)
      .set({ lastScheduledRunAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) })
      .where(eq(schema.reports.id, overdue.id));

    const due = await getReportsDueForScheduledRun(db);
    expect(due.some((r) => r.id === recentlyRun.id)).toBe(false);
    expect(due.some((r) => r.id === overdue.id)).toBe(true);
  });

  it("excludes a monthly report that ran 10 days ago", async () => {
    const report = await makeReport();
    await updateReportSchedule(db, organizationId, report.id, "monthly");
    await db
      .update(schema.reports)
      .set({ lastScheduledRunAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) })
      .where(eq(schema.reports.id, report.id));

    const due = await getReportsDueForScheduledRun(db);
    expect(due.some((r) => r.id === report.id)).toBe(false);
  });

  it("markReportScheduledRun advances lastScheduledRunAt so the same report drops out of the due set", async () => {
    const report = await makeReport();
    await updateReportSchedule(db, organizationId, report.id, "weekly");

    const dueBefore = await getReportsDueForScheduledRun(db);
    expect(dueBefore.some((r) => r.id === report.id)).toBe(true);

    await markReportScheduledRun(db, report.id);

    const dueAfter = await getReportsDueForScheduledRun(db);
    expect(dueAfter.some((r) => r.id === report.id)).toBe(false);
  });

  it("updateReportSchedule returns false for a report that doesn't belong to this organization", async () => {
    const updated = await updateReportSchedule(
      db,
      organizationId,
      "00000000-0000-0000-0000-000000000000",
      "weekly",
    );
    expect(updated).toBe(false);
  });

  describe("share links", () => {
    async function makeCompletedRun() {
      const report = await makeReport();
      const run = await createReportRun(db, organizationId, {
        reportId: report.id,
        requestedByUserId: userId,
        periodStart: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        periodEnd: new Date(),
      });
      await markReportRunCompleted(db, run.id);
      return { report, run };
    }

    it("creates a share link for a completed run, retrievable by its token hash", async () => {
      const { run } = await makeCompletedRun();
      const tokenHash = hashToken("test-raw-token-1");
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      const result = await createReportShareLink(db, organizationId, run.id, {
        tokenHash,
        expiresAt,
        createdByUserId: userId,
      });
      expect(result).toBe("ok");

      const shared = await getReportShareLinkByToken(db, tokenHash);
      expect(shared?.reportRunId).toBe(run.id);

      const active = await getActiveReportShareLink(db, organizationId, run.id);
      expect(active?.expiresAt.getTime()).toBe(expiresAt.getTime());
    });

    it("rejects creating a share link for a run that isn't completed", async () => {
      const report = await makeReport();
      const run = await createReportRun(db, organizationId, {
        reportId: report.id,
        requestedByUserId: userId,
        periodStart: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        periodEnd: new Date(),
      });

      const result = await createReportShareLink(db, organizationId, run.id, {
        tokenHash: hashToken("test-raw-token-2"),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdByUserId: userId,
      });
      expect(result).toBe("run_not_completed");
    });

    it("rejects creating a share link for a run outside the organization", async () => {
      const { run } = await makeCompletedRun();
      const otherOrgId = asOrganizationId("00000000-0000-0000-0000-000000000000");

      const result = await createReportShareLink(db, otherOrgId, run.id, {
        tokenHash: hashToken("test-raw-token-3"),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdByUserId: userId,
      });
      expect(result).toBe("not_found");
    });

    it("never resolves an expired link, even though it was never revoked", async () => {
      const { run } = await makeCompletedRun();
      const tokenHash = hashToken("test-raw-token-4");
      await createReportShareLink(db, organizationId, run.id, {
        tokenHash,
        expiresAt: new Date(Date.now() - 60 * 1000), // already expired
        createdByUserId: userId,
      });

      expect(await getReportShareLinkByToken(db, tokenHash)).toBeUndefined();
      expect(
        await getActiveReportShareLink(db, organizationId, run.id),
      ).toBeUndefined();
    });

    it("revokeReportShareLinks makes an active link stop resolving", async () => {
      const { run } = await makeCompletedRun();
      const tokenHash = hashToken("test-raw-token-5");
      await createReportShareLink(db, organizationId, run.id, {
        tokenHash,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdByUserId: userId,
      });
      expect(await getReportShareLinkByToken(db, tokenHash)).toBeDefined();

      const revoked = await revokeReportShareLinks(db, organizationId, run.id);
      expect(revoked).toBe(true);

      expect(await getReportShareLinkByToken(db, tokenHash)).toBeUndefined();
      expect(
        await getActiveReportShareLink(db, organizationId, run.id),
      ).toBeUndefined();
    });

    it("an unknown token resolves to nothing, never a fabricated fallback", async () => {
      expect(
        await getReportShareLinkByToken(db, hashToken("never-issued-token")),
      ).toBeUndefined();
    });
  });
});
