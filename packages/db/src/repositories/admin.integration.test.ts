import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../client";
import { organizations, sources, workspaces } from "../schema/index";
import { createProject } from "./projects";
import {
  checkDatabaseHealth,
  getPlatformTotals,
  listOrganizationsForAdmin,
  listSourcesForAdmin,
} from "./admin";
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
});
