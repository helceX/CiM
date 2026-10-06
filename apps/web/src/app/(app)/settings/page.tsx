import Link from "next/link";
import {
  db,
  getBillingProfile,
  getCreditSummary,
  getLatestFeatureUsage,
  getTrackedKeywordCount,
  getOrganizationWebhookUrl,
  getRetentionPolicy,
  getSubscription,
  listApiKeys,
  listBrandGroups,
  listMonitoringQueries,
  listProjects,
  listSocialConnections,
} from "@cim/db";
import { PLANNED_SOCIAL_PLATFORMS, SOCIAL_PROVIDERS, configuredSocialProviders } from "@cim/ingestion";
import { getMonitoringQueryLimit } from "@cim/core";
import { requireOrgContext } from "@/lib/tenant";
import { getCurrentUser } from "@/lib/session";
import {
  DataExportButton,
  DeleteAccountDialog,
  DeleteOrganizationDialog,
} from "./danger-zone";
import { RetentionSection } from "./retention-section";
import { WebhookSection } from "./webhook-section";
import { ApiKeysSection } from "./api-keys-section";
import { UsageSection } from "./usage-section";
import { BrandGroupsSection } from "./brand-groups-section";
import { BillingProfileSection } from "./billing-profile-section";
import { ConnectedAccountsSection } from "./connected-accounts-section";

const TABS = [
  { key: "general", label: "General" },
  { key: "billing", label: "Plan & billing" },
  { key: "developers", label: "Developers" },
  { key: "privacy", label: "Privacy" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await requireOrgContext();
  const rawTab = (await searchParams).tab;
  const requested = Array.isArray(rawTab) ? rawTab[0] : rawTab;
  const tab: TabKey = TABS.some((t) => t.key === requested) ? (requested as TabKey) : "general";
  const [
    retentionPolicy,
    webhookUrl,
    apiKeys,
    subscription,
    usage,
    brandGroups,
    queries,
    projects,
    trackedKeywords,
    credits,
    billingProfile,
    socialConnections,
  ] = await Promise.all([
    getRetentionPolicy(db, context.organizationId),
    getOrganizationWebhookUrl(db, context.organizationId),
    listApiKeys(db, context.organizationId),
    getSubscription(db, context.organizationId),
    getLatestFeatureUsage(db, context.organizationId),
    listBrandGroups(db, context.organizationId),
    listMonitoringQueries(db, context.organizationId),
    listProjects(db, context.organizationId),
    getTrackedKeywordCount(db, context.organizationId),
    getCreditSummary(db, context.organizationId),
    // Only fetched for members who may see it; never passed to anyone else.
    context.permissions.includes("org:manage_billing")
      ? getBillingProfile(db, context.organizationId)
      : Promise.resolve(undefined),
    listSocialConnections(db, context.organizationId),
  ]);
  const rawSocial = (await searchParams).social;
  const socialNotice = Array.isArray(rawSocial) ? (rawSocial[0] ?? null) : (rawSocial ?? null);
  const configuredPlatforms = configuredSocialProviders(process.env);
  const isOperator = (await getCurrentUser())?.isPlatformSuperAdmin === true;
  const canManageSettings = context.permissions.includes("org:manage_settings");
  const canManageApiKeys = context.permissions.includes("api_keys:manage");
  const canManageBilling = context.permissions.includes("org:manage_billing");
  const canManageBrandGroups = context.permissions.includes("monitoring:write");

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <h1>Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {context.organizationName} — organization, plan, developer tools and privacy. Members and
          roles live under{" "}
          <Link href="/team" className="text-primary underline underline-offset-2">
            Team
          </Link>
          .
        </p>
      </div>

      <nav aria-label="Settings sections" className="flex flex-wrap gap-2">
        {TABS.map((item) => (
          <Link
            key={item.key}
            href={item.key === "general" ? "/settings" : `/settings?tab=${item.key}`}
            aria-current={tab === item.key ? "page" : undefined}
            className="mp-tab"
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="flex flex-col gap-8">
      {tab === "general" ? (
        <>
      <section>
        <h2 className="text-sm font-semibold text-foreground">Organization</h2>
        <p className="mt-2 text-sm text-foreground">{context.organizationName}</p>
      </section>

      <BrandGroupsSection
        groups={brandGroups.map((group) => ({
          id: group.id,
          projectId: group.projectId,
          name: group.name,
          kind: group.kind,
          color: group.color,
          queryCount: group.queryCount,
        }))}
        queries={queries.map((query) => ({
          id: query.id,
          projectId: query.projectId,
          name: query.name,
          brandGroupId: query.brandGroupId,
        }))}
        projects={projects.map((project) => ({ id: project.id, name: project.name }))}
        canManage={canManageBrandGroups}
      />

      <RetentionSection
        mentionRetentionDays={retentionPolicy.mentionRetentionDays}
        canManageSettings={canManageSettings}
      />

      <WebhookSection
        // Only ever sent to the browser when the viewer can manage it —
        // see ApiKeysSection's comment below for why.
        webhookUrl={canManageSettings ? webhookUrl : null}
        hasWebhookUrl={webhookUrl !== null}
        canManageSettings={canManageSettings}
      />

      <ConnectedAccountsSection
        accounts={socialConnections.map((connection) => ({
          id: connection.id,
          platform: connection.platform,
          platformLabel: SOCIAL_PROVIDERS.find((provider) => provider.key === connection.platform)?.label ?? connection.platform,
          handle: connection.handle,
          displayName: connection.displayName,
          status: connection.status,
          lastSyncAt: connection.lastSyncAt ? connection.lastSyncAt.toISOString() : null,
          lastError: connection.lastError,
        }))}
        platforms={configuredPlatforms.map((provider) => ({
          key: provider.key,
          label: provider.label,
          reads: provider.reads,
          connected: socialConnections.some((connection) => connection.platform === provider.key),
        }))}
        planned={PLANNED_SOCIAL_PLATFORMS}
        canManage={canManageSettings}
        notice={socialNotice}
      />

        </>
      ) : null}

      {tab === "billing" ? (
        <>
      <UsageSection
        plan={subscription.plan}
        usage={usage}
        trackedKeywords={trackedKeywords}
        credits={credits}
        organizationName={context.organizationName}
        monitoringLimit={isOperator ? null : getMonitoringQueryLimit(subscription.plan)}
      />

      {canManageBilling ? (
        <BillingProfileSection
          profile={
            billingProfile
              ? {
                  legalName: billingProfile.legalName,
                  taxOffice: billingProfile.taxOffice,
                  taxId: billingProfile.taxId,
                  taxIdKind: billingProfile.taxIdKind,
                  addressLine: billingProfile.addressLine,
                  district: billingProfile.district,
                  city: billingProfile.city,
                  postalCode: billingProfile.postalCode,
                  invoiceEmail: billingProfile.invoiceEmail,
                }
              : null
          }
        />
      ) : null}

        </>
      ) : null}

      {tab === "developers" ? (
        <>
      <ApiKeysSection
        // Only ever sent to the browser when the viewer can manage keys —
        // a "use client" component's props all reach the RSC payload
        // regardless of what it renders, so a member without
        // api_keys:manage must never receive the real list.
        apiKeys={
          canManageApiKeys
            ? apiKeys.map((key) => ({
                ...key,
                lastUsedAt: key.lastUsedAt ? key.lastUsedAt.toISOString() : null,
                revokedAt: key.revokedAt ? key.revokedAt.toISOString() : null,
                createdAt: key.createdAt.toISOString(),
              }))
            : []
        }
        apiKeyCount={apiKeys.length}
        canManageApiKeys={canManageApiKeys}
      />

        </>
      ) : null}

      {tab === "privacy" ? (
        <>
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
        </>
      ) : null}
      </div>
    </div>
  );
}
