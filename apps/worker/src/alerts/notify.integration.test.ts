import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Queue } from "bullmq";
import type { SendEmailJobData } from "@cim/core";
import {
  asOrganizationId,
  createAlertRule,
  createProject,
  db,
  listNotifications,
  schema,
  updateOrganizationWebhookUrl,
} from "@cim/db";

const safeFetchMock = vi.fn();
// vi.mock is hoisted above these imports by vitest's transform, so
// fireAlert (imported below, normally) picks up the mocked safeFetch —
// deliverWebhook is production code with no test injection point of its
// own (correctly: it must behave identically for every real
// org-configured URL), so the module boundary is where this test doubles
// it, the same way `emailQueue` is faked below rather than hitting a
// real Redis-backed queue.
vi.mock("@cim/ingestion", () => ({
  safeFetch: (...args: unknown[]) => safeFetchMock(...args),
}));

import { fireAlert } from "./notify";

/**
 * Integration test (docs/testing/TEST_STRATEGY.md) against real Postgres
 * — proves fireAlert's webhook channel (docs/product/FEATURE_MATRIX.md P2
 * "Slack/Teams/webhook channels") posts the right payload to the org's
 * configured URL, skips silently when none is configured, and never lets
 * a webhook failure suppress the in_app notification the same call fires.
 */
describe("fireAlert — webhook channel (integration)", () => {
  let organizationId: ReturnType<typeof asOrganizationId>;
  let projectId: string;
  let userId: string;
  let queryId: string;
  const emailQueue = {
    add: async () => undefined,
  } as unknown as Queue<SendEmailJobData>;

  beforeAll(async () => {
    const [org] = await db
      .insert(schema.organizations)
      .values({ name: "Webhook Test Co", slug: `webhook-test-${Date.now()}` })
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
      name: "Webhook Test Project",
    });
    projectId = project.id;

    const [user] = await db
      .insert(schema.users)
      .values({
        email: `webhook-test-${Date.now()}@example.com`,
        passwordHash: "unused-in-this-test",
        firstName: "Webhook",
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

    const [query] = await db
      .insert(schema.monitoringQueries)
      .values({
        organizationId,
        projectId,
        name: "Webhook test query",
        queryAst: { include: ["webhook-marker"], exclude: [], exactPhrases: [] },
        booleanQuery: "webhook-marker",
        sourceTypes: ["news"],
      })
      .returning();
    if (!query) throw new Error("failed to create test query");
    queryId = query.id;
  });

  it("POSTs the alert payload to the org's configured webhook URL", async () => {
    await updateOrganizationWebhookUrl(
      db,
      organizationId,
      "https://hooks.example.test/abc",
    );
    safeFetchMock.mockResolvedValueOnce({
      status: 200,
      headers: new Headers(),
      body: "",
      finalUrl: "",
    });

    const rule = await createAlertRule(db, organizationId, {
      projectId,
      queryId,
      createdByUserId: userId,
      name: "Webhook rule",
      type: "keyword",
      channels: ["webhook"],
      cooldownMinutes: 60,
    });

    const fired = await fireAlert(emailQueue, rule, {
      triggerSummary: "3 new mentions matched",
      mentionIds: [],
    });

    expect(fired).toBe(true);
    expect(safeFetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = safeFetchMock.mock.calls[0] as [
      string,
      { method: string; body: string },
    ];
    expect(url).toBe("https://hooks.example.test/abc");
    expect(options.method).toBe("POST");
    const payload = JSON.parse(options.body);
    expect(payload.alertRuleName).toBe("Webhook rule");
    expect(payload.triggerSummary).toBe("3 new mentions matched");
    // A Slack incoming webhook rejects any payload without a top-level
    // "text" string (HTTP 400 no_text) — without this, the URL being
    // Slack-shaped wouldn't actually make delivery work against Slack.
    expect(payload.text).toContain("Webhook rule");
    expect(payload.text).toContain("3 new mentions matched");
  });

  it("skips webhook delivery silently when no URL is configured", async () => {
    await updateOrganizationWebhookUrl(db, organizationId, null);
    safeFetchMock.mockClear();

    const rule = await createAlertRule(db, organizationId, {
      projectId,
      queryId,
      createdByUserId: userId,
      name: "Webhook rule (no URL configured)",
      type: "keyword",
      channels: ["webhook"],
      cooldownMinutes: 60,
    });

    const fired = await fireAlert(emailQueue, rule, {
      triggerSummary: "test",
      mentionIds: [],
    });

    expect(fired).toBe(true);
    expect(safeFetchMock).not.toHaveBeenCalled();
  });

  it("still creates the in_app notification when webhook delivery throws", async () => {
    await updateOrganizationWebhookUrl(
      db,
      organizationId,
      "https://hooks.example.test/broken",
    );
    safeFetchMock.mockClear();
    safeFetchMock.mockRejectedValueOnce(new Error("connection refused"));

    const rule = await createAlertRule(db, organizationId, {
      projectId,
      queryId,
      createdByUserId: userId,
      name: "Webhook + in-app rule",
      type: "keyword",
      channels: ["in_app", "webhook"],
      cooldownMinutes: 60,
    });

    const fired = await fireAlert(emailQueue, rule, {
      triggerSummary: "webhook will fail, in_app must still land",
      mentionIds: [],
    });

    expect(fired).toBe(true);
    const notifications = await listNotifications(db, organizationId, userId, {
      limit: 10,
    });
    expect(notifications.some((n) => n.title === rule.name)).toBe(true);
  });
});
