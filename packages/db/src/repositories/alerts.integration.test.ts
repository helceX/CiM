import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../client";
import { organizations, workspaces } from "../schema/organizations";
import { users } from "../schema/users";
import { alertEvents } from "../schema/alerts";
import { createProject } from "./projects";
import { createMonitoringQuery } from "./monitoring-queries";
import { createAlertRule, getActiveAlertRulesForQuery, listAlertEventsForRule } from "./alerts";
import { softDeleteOrganization } from "./privacy";
import { asOrganizationId } from "./tenant-scope";

/**
 * Integration test (docs/testing/TEST_STRATEGY.md) against real Postgres
 * — proves listAlertEventsForRule returns an alert rule's *most recent*
 * events, not its oldest. Regression: the query previously sorted by
 * createdAt ascending (no desc()) before applying limit, so a rule with
 * more history than `limit` returned the earliest events ever recorded
 * and never surfaced anything newer — the opposite of every sibling list
 * function in this file (listAlertRules uses desc()).
 */
describe("listAlertEventsForRule (integration)", () => {
  let organizationId: ReturnType<typeof asOrganizationId>;
  let alertRuleId: string;
  const eventIds: string[] = [];

  beforeAll(async () => {
    const [org] = await db
      .insert(organizations)
      .values({ name: "Alert Events Test Co", slug: `alert-events-test-${Date.now()}` })
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
      name: "Alert Events Test Project",
    });

    const query = await createMonitoringQuery(db, organizationId, {
      projectId: project.id,
      name: "Alert events test query",
      queryAst: { include: ["test"], exclude: [], exactPhrases: [] },
      booleanQuery: "test",
      sourceTypes: ["news"],
    });

    const [user] = await db
      .insert(users)
      .values({
        email: `alert-events-test-${Date.now()}@example.com`,
        passwordHash: "not-a-real-hash",
        firstName: "Alert",
        lastName: "Tester",
        emailVerifiedAt: new Date(),
      })
      .returning();
    if (!user) throw new Error("failed to create test user");

    const rule = await createAlertRule(db, organizationId, {
      projectId: project.id,
      queryId: query.id,
      createdByUserId: user.id,
      name: "Alert events test rule",
      type: "keyword",
      channels: ["in_app"],
    });
    alertRuleId = rule.id;

    // Five events spread over five days, oldest first — explicit
    // createdAt values so ordering is asserted on data, not insert order.
    const now = Date.now();
    for (let daysAgo = 4; daysAgo >= 0; daysAgo--) {
      const [event] = await db
        .insert(alertEvents)
        .values({
          organizationId,
          alertRuleId,
          triggerSummary: `Event from ${daysAgo} days ago`,
          createdAt: new Date(now - daysAgo * 24 * 60 * 60 * 1000),
        })
        .returning();
      if (!event) throw new Error("failed to create test alert event");
      eventIds.push(event.id);
    }
  });

  afterAll(async () => {
    for (const id of eventIds) {
      await db.delete(alertEvents).where(eq(alertEvents.id, id));
    }
  });

  it("returns the most recent events first, not the oldest", async () => {
    const events = await listAlertEventsForRule(db, alertRuleId, 3);

    expect(events).toHaveLength(3);
    // eventIds was inserted oldest-first, so the newest 3 are the last 3
    // pushed — reversed, since the result must come back newest-first.
    expect(events.map((e) => e.id)).toEqual([...eventIds].slice(-3).reverse());
  });
});

/**
 * Integration test against real Postgres — regression: unlike
 * getActiveAlertRulesOfType (the scheduler-driven alert types' equivalent
 * lookup, which already joins organizations and checks isNull(deletedAt)),
 * this immediate-trigger path had no such check, so a rule belonging to a
 * soft-deleted organization kept firing (in-app/email/webhook) for any
 * mention still in flight when the org was deleted.
 */
describe("getActiveAlertRulesForQuery (integration)", () => {
  let organizationId: ReturnType<typeof asOrganizationId>;
  let queryId: string;
  let alertRuleId: string;

  beforeAll(async () => {
    const [org] = await db
      .insert(organizations)
      .values({ name: "Deleted Org Alert Test Co", slug: `deleted-org-alert-test-${Date.now()}` })
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
      name: "Deleted Org Alert Test Project",
    });

    const query = await createMonitoringQuery(db, organizationId, {
      projectId: project.id,
      name: "Deleted org alert test query",
      queryAst: { include: ["test"], exclude: [], exactPhrases: [] },
      booleanQuery: "test",
      sourceTypes: ["news"],
    });
    queryId = query.id;

    const [user] = await db
      .insert(users)
      .values({
        email: `deleted-org-alert-test-${Date.now()}@example.com`,
        passwordHash: "not-a-real-hash",
        firstName: "Deleted Org",
        lastName: "Tester",
        emailVerifiedAt: new Date(),
      })
      .returning();
    if (!user) throw new Error("failed to create test user");

    const rule = await createAlertRule(db, organizationId, {
      projectId: project.id,
      queryId,
      createdByUserId: user.id,
      name: "Deleted org alert test rule",
      type: "keyword",
      channels: ["in_app"],
    });
    alertRuleId = rule.id;
  });

  it("stops returning a rule once its organization is soft-deleted", async () => {
    const before = await getActiveAlertRulesForQuery(db, queryId);
    expect(before.map((r) => r.id)).toContain(alertRuleId);

    await softDeleteOrganization(db, organizationId);

    const after = await getActiveAlertRulesForQuery(db, queryId);
    expect(after.map((r) => r.id)).not.toContain(alertRuleId);
  });
});
