import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "../client";
import { organizations } from "../schema/organizations";
import type { OrganizationId } from "./tenant-scope";

/**
 * softDeleteOrganization never clears webhookUrl — without the
 * isNull(deletedAt) check every other org-scoped read already applies
 * (listMembershipsForUser, getActiveAlertRulesOfType, resolveApiKeyByRawKey),
 * a deleted organization's external Slack/Teams/custom webhook would keep
 * receiving alert POSTs forever.
 */
export async function getOrganizationWebhookUrl(
  db: Db,
  organizationId: OrganizationId,
): Promise<string | null> {
  const [row] = await db
    .select({ webhookUrl: organizations.webhookUrl })
    .from(organizations)
    .where(and(eq(organizations.id, organizationId), isNull(organizations.deletedAt)))
    .limit(1);
  return row?.webhookUrl ?? null;
}

export async function updateOrganizationWebhookUrl(
  db: Db,
  organizationId: OrganizationId,
  webhookUrl: string | null,
): Promise<void> {
  await db
    .update(organizations)
    .set({ webhookUrl, updatedAt: new Date() })
    .where(eq(organizations.id, organizationId));
}
