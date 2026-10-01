import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../client";
import { organizations, sources, users, workspaces } from "../schema/index";
import { createProject } from "./projects";
import {
  checkDatabaseHealth,
  getPlatformTotals,
  listOrganizationsForAdmin,
  listRecentEmailsForAdmin,
  listSourcesForAdmin,
  listUnverifiedUsersForAdmin,
} from "./admin";
import { enqueueEmail, markEmailSent, recordEmailError } from "./auth";
import { asOrganizationId } from "./tenant-scope";

/**
 * Integration test (docs/testing/TEST_STRATEGY.md) against real Postgres
 * — proves the platform-admin aggregates are real counts, not fixtures.
 */
describe("admin repository (integration)", () => {
  let organizationId: ReturnType<typeof asOrganizationId>;
  let sourceId: string;

  beforeAll(async () => {
    const [org] = await db
      .insert(organizations)
      .values({ name: "Admin Test Co", slug: `admin-test-${Date.now()}` })
      .returning();
    if (!org) throw new Error("failed to create test organization");
    organizationId = asOrganizationId(org.id);

    const [workspace] = await db
      .insert(workspaces)
      .values({ organizationId, name: "Default" })
      .returning();
    if (!workspace) throw new Error("failed to create test workspace");

    await createProject(db, organizationId, { workspaceId: workspace.id, name: "Admin Test Project" });

    const [source] = await db
      .insert(sources)
      .values({
        name: "Admin Test Wire",
        domain: `admin-test-${Date.now()}.example`,
        type: "news",
        connector: "mock",
        status: "error",
      })
      .returning();
    if (!source) throw new Error("failed to create test source");
    sourceId = source.id;
  });

  afterAll(async () => {
    await db.delete(organizations).where(eq(organizations.id, organizationId));
    await db.delete(sources).where(eq(sources.id, sourceId));
  });

  it("lists the organization with its real project count", async () => {
    const rows = await listOrganizationsForAdmin(db);
    const row = rows.find((r) => r.id === organizationId);
    expect(row).toBeDefined();
    expect(row?.projectCount).toBe(1);
    expect(row?.memberCount).toBe(0);
    expect(row?.createdAt).toBeInstanceOf(Date);
  });

  it("excludes a soft-deleted organization from the list and platform totals", async () => {
    const baseline = await getPlatformTotals(db);

    const [deletedOrg] = await db
      .insert(organizations)
      .values({
        name: "Deleted Admin Test Co",
        slug: `admin-test-deleted-${Date.now()}`,
        deletedAt: new Date(),
      })
      .returning();
    if (!deletedOrg) throw new Error("failed to create soft-deleted test organization");

    try {
      const rows = await listOrganizationsForAdmin(db);
      expect(rows.some((r) => r.id === deletedOrg.id)).toBe(false);

      // The count itself must not move either — not just that this one
      // row is absent from the list, which listOrganizationsForAdmin's
      // own query could satisfy without getPlatformTotals also excluding it.
      const after = await getPlatformTotals(db);
      expect(after.totalOrganizations).toBe(baseline.totalOrganizations);
    } finally {
      await db.delete(organizations).where(eq(organizations.id, deletedOrg.id));
    }
  });

  it("lists source health across every tenant, including a real status", async () => {
    const rows = await listSourcesForAdmin(db);
    const row = rows.find((r) => r.id === sourceId);
    expect(row?.status).toBe("error");
  });

  it("computes platform totals that include the test organization", async () => {
    const totals = await getPlatformTotals(db);
    expect(totals.totalOrganizations).toBeGreaterThanOrEqual(1);
    expect(totals.totalSources).toBeGreaterThanOrEqual(1);
  });

  it("reports the database reachable", async () => {
    expect(await checkDatabaseHealth(db)).toBe(true);
  });

  it("lists only live, unverified accounts as waiting for verification", async () => {
    const stamp = Date.now();
    const make = (label: string, extra: Partial<typeof users.$inferInsert>) =>
      db
        .insert(users)
        .values({ email: `adm-${label}-${stamp}@example.com`, passwordHash: "x", firstName: label, lastName: "T", ...extra })
        .returning();
    const [pending] = await make("pending", {});
    const [verified] = await make("verified", { emailVerifiedAt: new Date() });
    const [deleted] = await make("deleted", { deletedAt: new Date() });
    try {
      const emails = (await listUnverifiedUsersForAdmin(db, 500)).map((u) => u.email);
      expect(emails).toContain(pending!.email);
      expect(emails).not.toContain(verified!.email);
      expect(emails).not.toContain(deleted!.email);
    } finally {
      for (const u of [pending, verified, deleted]) await db.delete(users).where(eq(users.id, u!.id));
    }
  });

  it("shows how recent emails were delivered or why they failed, and never exposes the body", async () => {
    const sent = await enqueueEmail(db, { toEmail: "adm-sent@example.com", subject: "s", bodyText: "https://secret.example/verify?token=abc", kind: "admin_test" });
    const failing = await enqueueEmail(db, { toEmail: "adm-fail@example.com", subject: "f", bodyText: "x", kind: "admin_test" });
    await markEmailSent(db, sent.id, "console");
    await recordEmailError(db, failing.id, "Resend API request failed (403): domain not verified");

    const rows = await listRecentEmailsForAdmin(db, 50);
    const sentRow = rows.find((r) => r.id === sent.id)!;
    const failRow = rows.find((r) => r.id === failing.id)!;
    expect(sentRow).toMatchObject({ deliveredVia: "console", lastError: null });
    expect(sentRow.sentAt).not.toBeNull();
    expect(failRow.sentAt).toBeNull();
    expect(failRow.lastError).toContain("domain not verified");
    expect(JSON.stringify(rows)).not.toContain("token=abc");
    expect(Object.keys(sentRow)).not.toContain("bodyText");

    // A later successful send clears the stored error.
    await markEmailSent(db, failing.id, "resend");
    expect((await listRecentEmailsForAdmin(db, 50)).find((r) => r.id === failing.id)).toMatchObject({
      deliveredVia: "resend",
      lastError: null,
    });
  });
});
