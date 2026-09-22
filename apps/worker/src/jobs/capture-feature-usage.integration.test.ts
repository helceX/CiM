import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  asOrganizationId,
  createMonitoringQuery,
  createProject,
  db,
  getLatestFeatureUsage,
  schema,
} from "@cim/db";
import { processCaptureFeatureUsageJob } from "./capture-feature-usage";

/**
 * Integration test (docs/testing/TEST_STRATEGY.md) against real Postgres
 * — proves the daily usage-capture tick actually reaches every active
 * organization (the cross-tenant fan-out getOrganizationsWithRetentionPolicy's
 * sibling functions all share), not just one it was pointed at directly.
 */
describe("processCaptureFeatureUsageJob (integration)", () => {
  let organizationId: ReturnType<typeof asOrganizationId>;

  beforeAll(async () => {
    const [org] = await db
      .insert(schema.organizations)
      .values({ name: "Capture Usage Job Co", slug: `capture-usage-job-${Date.now()}` })
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
      name: "Capture Usage Job Project",
    });

    await createMonitoringQuery(db, organizationId, {
      projectId: project.id,
      name: "Capture usage job query",
      queryAst: { include: ["test"], exclude: [], exactPhrases: [] },
      booleanQuery: "test",
      sourceTypes: ["news"],
    });
  });

  afterAll(async () => {
    await db.delete(schema.organizations).where(eq(schema.organizations.id, organizationId));
  });

  it("captures a usage snapshot for every active organization, including this one", async () => {
    await processCaptureFeatureUsageJob();

    const usage = await getLatestFeatureUsage(db, organizationId);
    expect(usage).toBeDefined();
    expect(usage?.keywordsCount).toBe(1);
    expect(usage?.mentionsCount).toBe(0);
  });
});
