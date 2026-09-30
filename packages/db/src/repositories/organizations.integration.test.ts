import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../client";
import { organizations } from "../schema/organizations";
import { getOrganizationWebhookUrl, updateOrganizationWebhookUrl } from "./organizations";
import { softDeleteOrganization } from "./privacy";
import { asOrganizationId } from "./tenant-scope";

/**
 * Integration test (docs/testing/TEST_STRATEGY.md) against real Postgres
 * — regression: softDeleteOrganization only stamps organizations.deletedAt
 * and never clears webhookUrl. Every other org-scoped read already
 * excludes a deleted organization (listMembershipsForUser,
 * resolveApiKeyByRawKey, getActiveAlertRulesOfType); getOrganizationWebhookUrl
 * didn't, so a deleted organization's external Slack/Teams/custom webhook
 * kept receiving alert POSTs forever.
 */
describe("getOrganizationWebhookUrl (integration)", () => {
  it("stops returning a webhook URL once the organization is soft-deleted", async () => {
    const [org] = await db
      .insert(organizations)
      .values({ name: "Webhook Deletion Test Co", slug: `webhook-deletion-test-${Date.now()}` })
      .returning();
    if (!org) throw new Error("failed to create test organization");
    const organizationId = asOrganizationId(org.id);

    try {
      await updateOrganizationWebhookUrl(db, organizationId, "https://hooks.example.test/still-live");
      expect(await getOrganizationWebhookUrl(db, organizationId)).toBe(
        "https://hooks.example.test/still-live",
      );

      await softDeleteOrganization(db, organizationId);

      expect(await getOrganizationWebhookUrl(db, organizationId)).toBeNull();
    } finally {
      await db.delete(organizations).where(eq(organizations.id, organizationId));
    }
  });
});
