import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, count, eq, isNull } from "drizzle-orm";
import { db } from "../client";
import { organizations, projects, workspaces } from "../schema/organizations";
import { subscriptions } from "../schema/billing";
import { createProjectWithMonitoringQuery } from "./onboarding";
import { asOrganizationId } from "./tenant-scope";

/**
 * Integration test (docs/testing/TEST_STRATEGY.md) against real Postgres —
 * a code-review pass on the onboarding-complete route (which composes
 * createProject + createMonitoringQueryWithPlanLimit) found the project
 * insert wasn't transactional with the plan-limit check, leaving an
 * orphaned project behind on rejection. This proves the fix: a rejection
 * rolls back the project too, not just the query.
 */
describe("createProjectWithMonitoringQuery (integration)", () => {
  let organizationId: ReturnType<typeof asOrganizationId>;
  let workspaceId: string;

  beforeAll(async () => {
    const [org] = await db
      .insert(organizations)
      .values({ name: "Onboarding Test Co", slug: `onboarding-test-${Date.now()}` })
      .returning();
    if (!org) throw new Error("failed to create test organization");
    organizationId = asOrganizationId(org.id);

    const [workspace] = await db
      .insert(workspaces)
      .values({ organizationId, name: "Default" })
      .returning();
    if (!workspace) throw new Error("failed to create test workspace");
    workspaceId = workspace.id;
  });

  afterAll(async () => {
    await db.delete(organizations).where(eq(organizations.id, organizationId));
  });

  async function countProjects(): Promise<number> {
    const [row] = await db
      .select({ value: count() })
      .from(projects)
      .where(and(eq(projects.organizationId, organizationId), isNull(projects.deletedAt)));
    return Number(row?.value ?? 0);
  }

  it("creates both the project and its monitoring query on a fresh free-plan org", async () => {
    const result = await createProjectWithMonitoringQuery(db, organizationId, {
      workspaceId,
      projectName: "First project",
      queryAst: { include: ["Acme"], exclude: [], exactPhrases: [] },
      booleanQuery: "Acme",
      sourceTypes: ["news"],
    });
    expect(result.ok).toBe(true);
    expect(await countProjects()).toBe(1);
  });

  it("rolls back the project too when the plan-limit check rejects the query, leaving no orphan", async () => {
    const projectsBefore = await countProjects();

    const result = await createProjectWithMonitoringQuery(db, organizationId, {
      workspaceId,
      projectName: "Second project (should be rejected)",
      queryAst: { include: ["Globex"], exclude: [], exactPhrases: [] },
      booleanQuery: "Globex",
      sourceTypes: ["news"],
    });

    expect(result).toEqual({ ok: false, limit: 1 });
    // The rejected attempt's project must not persist — only the one
    // from the previous (accepted) test remains.
    expect(await countProjects()).toBe(projectsBefore);
  });

  it("succeeds again once the organization is on a paid plan", async () => {
    await db.insert(subscriptions).values({ organizationId, plan: "pro" });
    const projectsBefore = await countProjects();

    const result = await createProjectWithMonitoringQuery(db, organizationId, {
      workspaceId,
      projectName: "Third project (pro plan)",
      queryAst: { include: ["Initech"], exclude: [], exactPhrases: [] },
      booleanQuery: "Initech",
      sourceTypes: ["news"],
    });

    expect(result.ok).toBe(true);
    expect(await countProjects()).toBe(projectsBefore + 1);
  });
});
