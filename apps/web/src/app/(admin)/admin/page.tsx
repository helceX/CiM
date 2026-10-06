import Link from "next/link";
import { Badge } from "@cim/ui";
import { getConnectorCapabilities } from "@cim/core";
import {
  checkDatabaseHealth,
  countOpenTakedownRequests,
  db,
  getDatabaseSizeBytes,
  getPlatformTotals,
  listLargestTables,
  listOrganizationsForAdmin,
  listSourcesForAdmin,
} from "@cim/db";
import { requireSuperAdmin } from "@/lib/admin";
import { getQueueHealth } from "@/lib/admin-queues";
import { KpiRow } from "@/components/kpi-row";
import { StoragePrune } from "./storage-prune";

const SOURCE_STATUS_TONE: Record<string, "success" | "warning" | "danger" | "neutral"> =
  {
    healthy: "success",
    delayed: "warning",
    error: "danger",
    blocked: "danger",
    unavailable: "neutral",
  };

// docs/product/FEATURE_MATRIX_V2.md "Platform capability matrix" (master
// prompt §28) — never implies a capability a connector doesn't actually
// have; an unrecognized/not-yet-implemented connector renders every
// capability "unavailable"/"provider_required", never a guess.
const CAPABILITY_TONE: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  supported: "success",
  partial: "warning",
  provider_required: "neutral",
  unavailable: "danger",
};
const CAPABILITY_LABEL: Record<string, string> = {
  supported: "Supported",
  partial: "Partial",
  provider_required: "Provider required",
  unavailable: "Unavailable",
};

/**
 * docs/ux/SCREEN_INVENTORY.md §19 — platform-wide operational aggregates
 * only (orgs, jobs, source health, system health — the MVP-core row in
 * docs/product/FEATURE_MATRIX.md). Never a tenant's actual mentions or
 * monitoring queries — that's the "no implicit access to tenant
 * application views" line in docs/architecture/SECURITY.md.
 */
export default async function AdminOverviewPage() {
  await requireSuperAdmin();

  // checkDatabaseHealth already catches internally and resolves to false
  // rather than throwing — but that's pointless if a real Postgres outage
  // just makes one of its Promise.all siblings reject instead, aborting
  // the whole page (and the "Database unreachable" badge along with it)
  // before it ever gets to render. Each DB-dependent call below falls
  // back the same way getQueueHealth's Redis call already does — an
  // {ok, ...} wrapper, not a bare value — so a genuinely empty result
  // (0 organizations, no sources yet) never gets confused with "this
  // section's query failed", the same "never a fabricated zero" rule
  // billing.ts and usage-section.tsx already follow, and each failure is
  // logged so an operator debugging a partial outage isn't staring at a
  // silently-empty table with nothing in the logs to explain it.
  const emptyTotals = {
    totalOrganizations: 0,
    totalUsers: 0,
    totalSources: 0,
    totalMentions: 0,
    mentionsLast24h: 0,
  };
  const [totalsResult, dbHealthy, queueResult, organizationsResult, sourcesResult] =
    await Promise.all([
      getPlatformTotals(db)
        .then((totals) => ({ ok: true as const, totals }))
        .catch((error: unknown) => {
          console.error("[admin] getPlatformTotals failed:", error);
          return { ok: false as const, totals: emptyTotals };
        }),
      checkDatabaseHealth(db),
      getQueueHealth()
        .then((rows) => ({ ok: true as const, rows }))
        .catch((error: unknown) => {
          console.error("[admin] getQueueHealth failed:", error);
          return { ok: false as const, rows: [] };
        }),
      listOrganizationsForAdmin(db)
        .then((organizations) => ({ ok: true as const, organizations }))
        .catch((error: unknown) => {
          console.error("[admin] listOrganizationsForAdmin failed:", error);
          return { ok: false as const, organizations: [] };
        }),
      listSourcesForAdmin(db)
        .then((sources) => ({ ok: true as const, sources }))
        .catch((error: unknown) => {
          console.error("[admin] listSourcesForAdmin failed:", error);
          return { ok: false as const, sources: [] };
        }),
    ]);
  const openTakedowns = await countOpenTakedownRequests(db).catch(() => 0);
  const totals = totalsResult.totals;
  const redisHealthy = queueResult.ok;
  const queues = queueResult.rows;
  const organizations = organizationsResult.organizations;
  const sources = sourcesResult.sources;

  // Disk: what fills the Postgres volume. Never fatal to the page.
  const [dbSizeBytes, largestTables] = await Promise.all([
    getDatabaseSizeBytes(db).catch(() => null),
    listLargestTables(db, 6).catch(() => []),
  ]);
  const volumeMb = Number(process.env.DB_VOLUME_MB);
  const dbMb = dbSizeBytes === null ? null : dbSizeBytes / 1_048_576;
  const usedShare = dbMb !== null && volumeMb > 0 ? dbMb / volumeMb : null;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Platform overview</h1>
        <p className="text-sm text-muted-foreground">
          Operational aggregates across every organization — not a way to browse tenant
          content.
        </p>
        <p className="mt-2 text-sm">
          <Link href="/admin/email" className="text-primary underline underline-offset-2">
            Email delivery &amp; unverified accounts
          </Link>
          {" · "}
          <Link href="/admin/sources" className="text-primary underline underline-offset-2">
            Crawl sources &amp; Türkiye catalog
          </Link>
          {" · "}
          <Link href="/admin/takedowns" className="text-primary underline underline-offset-2">
            Takedown requests{openTakedowns > 0 ? ` (${openTakedowns} open)` : ""}
          </Link>
        </p>
      </div>

      <section>
        <h2 className="text-sm font-semibold text-foreground">System health</h2>
        <div className="mt-3 flex gap-3">
          <Badge tone={dbHealthy ? "success" : "danger"}>
            Database {dbHealthy ? "reachable" : "unreachable"}
          </Badge>
          <Badge tone={redisHealthy ? "success" : "danger"}>
            Redis {redisHealthy ? "reachable" : "unreachable"}
          </Badge>
          {!totalsResult.ok ? <Badge tone="danger">Totals unavailable</Badge> : null}
        </div>
        <div className="mt-4">
          <KpiRow
            items={[
              { label: "Organizations", value: String(totals.totalOrganizations) },
              { label: "Users", value: String(totals.totalUsers) },
              { label: "Sources", value: String(totals.totalSources) },
              {
                label: "Mentions (24h)",
                value: String(totals.mentionsLast24h),
                hint: `${totals.totalMentions} total`,
              },
            ]}
          />
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-foreground">Storage</h2>
        {dbMb === null ? (
          <p className="mt-2 text-sm text-muted-foreground">Database size is not available.</p>
        ) : (
          <div className="mt-3 flex flex-col gap-3">
            <p className="text-sm text-foreground">
              Database: <strong className="tabular-nums">{Math.round(dbMb).toLocaleString()} MB</strong>
              {usedShare !== null ? (
                <>
                  {" "}of a {volumeMb.toLocaleString()} MB volume ({Math.round(usedShare * 100)}%)
                  {usedShare > 0.8 ? <Badge tone="danger">Almost full — enlarge the volume</Badge> : usedShare > 0.6 ? <Badge tone="warning">Over 60%</Badge> : null}
                </>
              ) : (
                <span className="text-muted-foreground">
                  {" "}— set DB_VOLUME_MB (the Postgres volume size in MB) on the web and worker services to see the share used.
                </span>
              )}
            </p>
            {largestTables.length > 0 ? (
              <ul className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                {largestTables.map((table) => (
                  <li key={table.name} className="flex justify-between gap-3 rounded border border-border px-3 py-1.5">
                    <span className="truncate text-foreground">{table.name}</span>
                    <span className="tabular-nums">
                      {Math.round(table.bytes / 1_048_576).toLocaleString()} MB · ~{table.rows.toLocaleString()} rows
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        )}
        <div className="mt-4">
          <StoragePrune />
        </div>
      </section>

      <section>
        <h2 id="job-queues" className="scroll-mt-4 text-sm font-semibold text-foreground">Job queues</h2>
        <div className="mt-3 overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-surface-muted text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Queue</th>
                <th className="px-4 py-2 font-medium">Waiting</th>
                <th className="px-4 py-2 font-medium">Active</th>
                <th className="px-4 py-2 font-medium">Completed</th>
                <th className="px-4 py-2 font-medium">Failed</th>
                <th className="px-4 py-2 font-medium">Delayed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {queues.map((q) => (
                <tr key={q.queueName}>
                  <td className="px-4 py-3 font-medium text-foreground">
                    {q.queueName}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{q.waiting}</td>
                  <td className="px-4 py-3 text-muted-foreground">{q.active}</td>
                  <td className="px-4 py-3 text-muted-foreground">{q.completed}</td>
                  <td className="px-4 py-3">
                    {q.failed > 0 ? (
                      <Link href={`/admin/jobs/${q.queueName}`}>
                        <Badge tone="danger">{q.failed}</Badge>
                      </Link>
                    ) : (
                      q.failed
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{q.delayed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-foreground">Organizations</h2>
          {!organizationsResult.ok ? (
            <Badge tone="danger">Unavailable — query failed</Badge>
          ) : null}
        </div>
        <div className="mt-3 overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-surface-muted text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Members</th>
                <th className="px-4 py-2 font-medium">Projects</th>
                <th className="px-4 py-2 font-medium">Mentions</th>
                <th className="px-4 py-2 font-medium">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {organizations.map((org) => (
                <tr key={org.id}>
                  <td className="px-4 py-3 font-medium text-foreground">{org.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{org.memberCount}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {org.projectCount}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {org.mentionCount}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {org.createdAt.toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-foreground">Source health</h2>
          {!sourcesResult.ok ? (
            <Badge tone="danger">Unavailable — query failed</Badge>
          ) : null}
        </div>
        <div className="mt-3 overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-surface-muted text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Type</th>
                <th className="px-4 py-2 font-medium">Connector</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Capabilities</th>
                <th className="px-4 py-2 font-medium">Last checked</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sources.map((source) => {
                const capabilities = getConnectorCapabilities(source.connector);
                return (
                  <tr key={source.id}>
                    <td className="px-4 py-3 font-medium text-foreground">
                      {source.name}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{source.type}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {source.connector}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={SOURCE_STATUS_TONE[source.status] ?? "neutral"}>
                        {source.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        <Badge tone={CAPABILITY_TONE[capabilities.realTimeSearch]}>
                          Real-time: {CAPABILITY_LABEL[capabilities.realTimeSearch]}
                        </Badge>
                        <Badge tone={CAPABILITY_TONE[capabilities.engagementMetrics]}>
                          Engagement: {CAPABILITY_LABEL[capabilities.engagementMetrics]}
                        </Badge>
                        <Badge tone={CAPABILITY_TONE[capabilities.officialApi]}>
                          Official API: {CAPABILITY_LABEL[capabilities.officialApi]}
                        </Badge>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {source.lastCheckedAt
                        ? source.lastCheckedAt.toLocaleString()
                        : "Not available"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
