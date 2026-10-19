import Link from "next/link";
import { Badge } from "@cim/ui";
import { getConnectorCapabilities } from "@cim/core";
import { requireSuperAdmin } from "@/lib/admin";
import { loadAdminOverview } from "@/lib/admin-overview";
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

  const overview = await loadAdminOverview();
  const { totals, dbHealthy, redisHealthy, statusCounts, openTakedowns, dbSizeBytes } = overview;
  const queues = overview.queues ?? [];
  const organizations = overview.organizations ?? [];
  const sources = overview.sources ?? [];
  const largestTables = overview.largestTables ?? [];
  const sourceTotal = statusCounts === null ? null
    : Object.values(statusCounts).reduce((sum, n) => sum + n, 0);
  const attentionSources = statusCounts === null ? null
    : ["delayed", "error", "blocked"].reduce((sum, status) => sum + (statusCounts?.[status] ?? 0), 0);
  const failedQueues = overview.queues?.filter((queue) => queue.failedLast24h > 0) ?? null;
  const unavailableSections = [
    ["Platform totals", totals], ["Organizations", overview.organizations],
    ["Source sample", overview.sources], ["Source totals", statusCounts],
    ["Takedown requests", openTakedowns], ["Database size", dbSizeBytes],
    ["Table sizes", overview.largestTables], ["Job queues", overview.queues],
  ].filter(([, value]) => value === null).map(([name]) => String(name));
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
          <Link
            href="/admin/email"
            className="text-primary underline underline-offset-2"
          >
            Email delivery &amp; unverified accounts
          </Link>
          {" · "}
          <Link
            href="/admin/sources"
            className="text-primary underline underline-offset-2"
          >
            Crawl sources &amp; Türkiye catalog
          </Link>
          {" · "}
          <Link
            href="/admin/takedowns"
            className="text-primary underline underline-offset-2"
          >
            Takedown requests{openTakedowns === null ? " (count unavailable)" : ""}{openTakedowns !== null && openTakedowns > 0 ? ` (${openTakedowns} open)` : ""}
          </Link>
        </p>
      </div>

      <section>
        <h2 className="text-sm font-semibold text-foreground">System health</h2>
        <div className="mt-3 flex flex-wrap gap-3">
          <Badge tone={dbHealthy ? "success" : "danger"}>
            Database {dbHealthy ? "reachable" : "unreachable"}
          </Badge>
          <Badge tone={redisHealthy ? "success" : "danger"}>
            Redis {redisHealthy ? "reachable" : "unreachable"}
          </Badge>
          {totals === null ? <Badge tone="danger">Totals unavailable</Badge> : null}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Last loaded (UTC): <time dateTime={overview.checkedAt.toISOString()}>{overview.checkedAt.toISOString().replace("T", " ").slice(0, 19)}</time>.
          Reload this page for a fresh check. Service reachability does not guarantee every measurement succeeded.
        </p>
        <div className="mt-4">
          <KpiRow
            items={[
              { label: "Organizations", value: totals === null ? "Unavailable" : totals.totalOrganizations.toLocaleString() },
              { label: "Users", value: totals === null ? "Unavailable" : totals.totalUsers.toLocaleString() },
              { label: "Sources", value: totals === null ? "Unavailable" : totals.totalSources.toLocaleString() },
              {
                label: "Mentions (24h)",
                value: totals === null ? "Unavailable" : totals.mentionsLast24h.toLocaleString(),
                hint: totals === null ? "Measurement failed" : `${totals.totalMentions.toLocaleString()} total`,
              },
            ]}
          />
        </div>
      </section>

      <section aria-labelledby="attention-heading" className="rounded-lg border border-border p-4">
        <h2 id="attention-heading" className="text-sm font-semibold text-foreground">Needs attention</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {!dbHealthy ? <li>Database check failed. Check the database service.</li> : null}
          {!redisHealthy ? <li>Redis check failed. Check the queue service.</li> : null}
          {unavailableSections.length > 0 ? <li>Measurements unavailable: {unavailableSections.join(", ")}. Reload or inspect service logs before treating these as empty.</li> : null}
          {attentionSources !== null && attentionSources > 0 ? <li><Link href="/admin/sources" className="text-primary underline underline-offset-2">Review {attentionSources.toLocaleString()} delayed, errored or blocked sources</Link>. Paused sources are excluded.</li> : null}
          {failedQueues !== null && failedQueues.length > 0 ? <li><Link href="#job-queues" className="text-primary underline underline-offset-2">Review {failedQueues.length} queues with retained failures in the last 24 hours</Link>.</li> : null}
          {openTakedowns !== null && openTakedowns > 0 ? <li><Link href="/admin/takedowns" className="text-primary underline underline-offset-2">Review {openTakedowns} open takedown requests</Link>.</li> : null}
          {usedShare !== null && usedShare > 0.6 ? <li><Link href="#storage" className="text-primary underline underline-offset-2">Database size exceeds {usedShare > 0.8 ? "80" : "60"}% of configured volume capacity</Link>. Review storage and capacity.</li> : null}
          {dbHealthy && redisHealthy && unavailableSections.length === 0 && attentionSources === 0 && failedQueues?.length === 0 && openTakedowns === 0 && (usedShare === null || usedShare <= 0.6) ? <li>No issues detected by these checks.</li> : null}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">This summary covers the checks below. It does not confirm worker progress, content freshness or complete disk usage; database size excludes other volume files.</p>
      </section>

      <section>
        <h2 id="storage" className="scroll-mt-4 text-sm font-semibold text-foreground">Storage</h2>
        {dbMb === null ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Database size is not available.
          </p>
        ) : (
          <div className="mt-3 flex flex-col gap-3">
            <p className="text-sm text-foreground">
              Database:{" "}
              <strong className="tabular-nums">
                {Math.round(dbMb).toLocaleString()} MB
              </strong>
              {usedShare !== null ? (
                <>
                  {" "}
                  of a {volumeMb.toLocaleString()} MB volume (
                  {Math.round(usedShare * 100)}%)
                  {usedShare > 0.8 ? (
                    <Badge tone="danger">Almost full — enlarge the volume</Badge>
                  ) : usedShare > 0.6 ? (
                    <Badge tone="warning">Over 60%</Badge>
                  ) : null}
                </>
              ) : (
                <span className="text-muted-foreground">
                  {" "}
                  — set DB_VOLUME_MB (the Postgres volume size in MB) on the web and
                  worker services to see the share used.
                </span>
              )}
            </p>
            {overview.largestTables === null ? <p className="text-sm text-muted-foreground">Table sizes unavailable — query failed.</p> : null}
            {largestTables.length > 0 ? (
              <ul className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                {largestTables.map((table) => (
                  <li
                    key={table.name}
                    className="flex justify-between gap-3 rounded border border-border px-3 py-1.5"
                  >
                    <span className="truncate text-foreground">{table.name}</span>
                    <span className="tabular-nums">
                      {Math.round(table.bytes / 1_048_576).toLocaleString()} MB · ~
                      {table.rows.toLocaleString()} rows
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
        <h2
          id="job-queues"
          className="scroll-mt-4 text-sm font-semibold text-foreground"
        >
          Job queues
        </h2>
        {overview.queues === null ? <p className="mt-2 text-sm text-muted-foreground">Queue measurements unavailable — query failed.</p> : null}
        <p className="mt-2 text-xs text-muted-foreground">
          Retained totals are historical, not a current outage. The 24h count includes
          failures still retained in Redis; retried or removed jobs are excluded. Last
          success and duration describe the newest retained completed job. Missing
          history is shown as unavailable.
        </p>
        <div className="mt-3 overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-surface-muted text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Queue</th>
                <th className="px-4 py-2 font-medium">Waiting</th>
                <th className="px-4 py-2 font-medium">Active</th>
                <th className="px-4 py-2 font-medium">Completed</th>
                <th className="px-4 py-2 font-medium">Failed (retained)</th>
                <th className="px-4 py-2 font-medium">Failed (24h)</th>
                <th className="px-4 py-2 font-medium">Last success (UTC)</th>
                <th className="px-4 py-2 font-medium">Oldest waiting (UTC)</th>
                <th className="px-4 py-2 font-medium">Last duration</th>
                <th className="px-4 py-2 font-medium">Delayed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {queues.map((q) => (
                <tr key={q.queueName}>
                  <td className="px-4 py-3 font-medium text-foreground">
                    <Link
                      href={`/admin/jobs/${q.queueName}`}
                      className="underline-offset-2 hover:underline"
                    >
                      {q.queueName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{q.waiting}</td>
                  <td className="px-4 py-3 text-muted-foreground">{q.active}</td>
                  <td className="px-4 py-3 text-muted-foreground">{q.completed}</td>
                  <td className="px-4 py-3">
                    {q.failed > 0 ? (
                      <Link href={`/admin/jobs/${q.queueName}`}>
                        <Badge tone={q.failedLast24h > 0 ? "danger" : "neutral"}>
                          {q.failed}
                        </Badge>
                      </Link>
                    ) : (
                      q.failed
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={q.failedLast24h > 0 ? "danger" : "success"}>
                      {q.failedLast24h}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {q.lastCompletedAt === null
                      ? "Unavailable"
                      : new Date(q.lastCompletedAt).toISOString()}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {q.oldestWaitingAt === null
                      ? "None"
                      : new Date(q.oldestWaitingAt).toISOString()}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {q.lastDurationMs === null
                      ? "Unavailable"
                      : `${q.lastDurationMs} ms`}
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
          {overview.organizations === null ? (
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

      <section aria-labelledby="source-health-heading">
        <div className="flex flex-wrap items-center gap-3">
          <h2
            id="source-health-heading"
            className="text-sm font-semibold text-foreground"
          >
            Source health
          </h2>
          {overview.sources === null ? (
            <Badge tone="danger">Unavailable — query failed</Badge>
          ) : null}
          {statusCounts === null ? <Badge tone="danger">Source totals unavailable</Badge> : null}
          {(["healthy", "delayed", "error", "blocked", "unavailable"] as const)
            .filter((status) => (statusCounts?.[status] ?? 0) > 0)
            .map((status) => (
              <Badge key={status} tone={SOURCE_STATUS_TONE[status] ?? "neutral"}>
                {statusCounts?.[status]!.toLocaleString()}{" "}
                {status === "unavailable" ? "paused" : status}
              </Badge>
            ))}
        </div>
        <details className="group mt-3 rounded-lg border border-border">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium text-foreground hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            <span>
              Show the sources that need attention first
              <span className="ml-2 font-normal text-muted-foreground">
                ({overview.sources === null ? "sample unavailable" : `${sources.length.toLocaleString()} shown`}
                {sourceTotal === null ? "; total unavailable" : ` of ${sourceTotal.toLocaleString()}`})
              </span>
            </span>
            <span
              aria-hidden="true"
              className="text-muted-foreground transition-transform group-open:rotate-180"
            >
              ▾
            </span>
          </summary>
          <div className="overflow-x-auto border-t border-border">
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
                            Engagement:{" "}
                            {CAPABILITY_LABEL[capabilities.engagementMetrics]}
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
            <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
              Every source, with filters and pause controls, is on{" "}
              <Link
                href="/admin/sources"
                className="text-primary underline underline-offset-2"
              >
                Crawl sources
              </Link>
              .
            </p>
          </div>
        </details>
      </section>
    </div>
  );
}
