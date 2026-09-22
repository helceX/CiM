import { can } from "@cim/core";
import {
  db,
  getLatestFeatureUsage,
  getOrganizationWebhookUrl,
  getRetentionPolicy,
  getSubscription,
  listApiKeys,
  listMembersForOrganization,
} from "@cim/db";
import { requireOrgContext } from "@/lib/tenant";
import {
  DataExportButton,
  DeleteAccountDialog,
  DeleteOrganizationDialog,
} from "./danger-zone";
import { MembersSection } from "./members-section";
import { RetentionSection } from "./retention-section";
import { WebhookSection } from "./webhook-section";
import { ApiKeysSection } from "./api-keys-section";
import { UsageSection } from "./usage-section";

export default async function SettingsPage() {
  const context = await requireOrgContext();
  const [members, retentionPolicy, webhookUrl, apiKeys, subscription, usage] = await Promise.all([
    listMembersForOrganization(db, context.organizationId),
    getRetentionPolicy(db, context.organizationId),
    getOrganizationWebhookUrl(db, context.organizationId),
    listApiKeys(db, context.organizationId),
    getSubscription(db, context.organizationId),
    getLatestFeatureUsage(db, context.organizationId),
  ]);
  const canManageMembers = can(context.role, "org:manage_members");
  const canManageSettings = can(context.role, "org:manage_settings");
  const canManageApiKeys = can(context.role, "api_keys:manage");

  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Organization profile and members.
        </p>
      </div>

      <section>
        <h2 className="text-sm font-semibold text-foreground">Organization</h2>
        <p className="mt-2 text-sm text-foreground">{context.organizationName}</p>
      </section>

      <MembersSection
        members={members}
        canManageMembers={canManageMembers}
        currentUserId={context.userId}
      />

      <RetentionSection
        mentionRetentionDays={retentionPolicy.mentionRetentionDays}
        canManageSettings={canManageSettings}
      />

      <WebhookSection webhookUrl={webhookUrl} canManageSettings={canManageSettings} />

      <UsageSection plan={subscription.plan} usage={usage} />

      <ApiKeysSection
        apiKeys={apiKeys.map((key) => ({
          ...key,
          lastUsedAt: key.lastUsedAt ? key.lastUsedAt.toISOString() : null,
          revokedAt: key.revokedAt ? key.revokedAt.toISOString() : null,
          createdAt: key.createdAt.toISOString(),
        }))}
        canManageApiKeys={canManageApiKeys}
      />

      <section>
        <h2 className="text-sm font-semibold text-foreground">Your data</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Download a copy of your account and membership data.
        </p>
        <div className="mt-3">
          <DataExportButton />
        </div>
      </section>

      <section className="rounded-lg border border-danger/30 p-4">
        <h2 className="text-sm font-semibold text-danger">Danger zone</h2>
        <div className="mt-3 flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-foreground">Delete your account</p>
              <p className="text-xs text-muted-foreground">
                Anonymizes your identity across every organization you belong to.
              </p>
            </div>
            <DeleteAccountDialog />
          </div>
          {context.role === "organization_owner" ? (
            <div className="flex items-center justify-between gap-4 border-t border-border pt-4">
              <div>
                <p className="text-sm font-medium text-foreground">
                  Delete this organization
                </p>
                <p className="text-xs text-muted-foreground">
                  Removes every member&apos;s access and stops all monitoring.
                </p>
              </div>
              <DeleteOrganizationDialog organizationName={context.organizationName} />
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
