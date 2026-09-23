import Link from "next/link";
import { Badge } from "@cim/ui";
import {
  checkDatabaseHealth,
  db,
  getPlatformTotals,
  listOrganizationsForAdmin,
  listSourcesForAdmin,
} from "@cim/db";
import { requireSuperAdmin } from "@/lib/admin";
import { getQueueHealth } from "@/lib/admin-queues";
import { KpiRow } from "@/components/kpi-row";

const SOURCE_STATUS_TONE: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  healthy: "success",
  delayed: "warning",
  error: "danger",
  blocked: "danger",
  unavailable: "neutral",
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
  // back the same way getQueueHealth's Redis call already does, so the
  // page still renders — with empty/zeroed sections — when Postgres is
  // the thing that's actually down.
  const emptyTotals = { totalOrganizations: 0, totalUsers: 0, totalSources: 0, totalMentions: 0, mentionsLast24h: 0 };
  const [totals, dbHealthy, queueResult, organizations, sources] = await Promise.all([
    getPlatformTotals(db).catch(() => emptyTotals),
    checkDatabaseHealth(db),
    getQueueHealth()
      .then((rows) => ({ ok: true as const, rows }))
      .catch(() => ({ ok: false as const, rows: [] })),
    listOrganizationsForAdmin(db).catch(() => []),
    listSourcesForAdmin(db).catch(() => []),
  ]);
  const redisHealthy = queueResult.ok;
  const queues = queueResult.rows;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Platform overview</h1>
        <p className="text-sm text-muted-foreground">
          Operational aggregates across every organization — not a way to browse tenant content.
        </p>
      </div>

      <section>
        <h2 className="text-sm font-semibold text-foreground">System health</h2>
        <div className="mt-3 flex gap-3">
          <Badge tone={dbHealthy ? "success" : "danger"}>Database {dbHealthy ? "reachable" : "unreachable"}</Badge>
          <Badge tone={redisHealthy ? "success" : "danger"}>Redis {redisHealthy ? "reachable" : "unreachable"}</Badge>
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
        <h2 className="text-sm font-semibold text-foreground">Job queues</h2>
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
                  <td className="px-4 py-3 font-medium text-foreground">{q.queueName}</td>
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
        <h2 className="text-sm font-semibold text-foreground">Organizations</h2>
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
                  <td className="px-4 py-3 text-muted-foreground">{org.projectCount}</td>
                  <td className="px-4 py-3 text-muted-foreground">{org.mentionCount}</td>
                  <td className="px-4 py-3 text-muted-foreground">{org.createdAt.toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-foreground">Source health</h2>
        <div className="mt-3 overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-surface-muted text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Type</th>
                <th className="px-4 py-2 font-medium">Connector</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Last checked</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sources.map((source) => (
                <tr key={source.id}>
                  <td className="px-4 py-3 font-medium text-foreground">{source.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{source.type}</td>
                  <td className="px-4 py-3 text-muted-foreground">{source.connector}</td>
                  <td className="px-4 py-3">
                    <Badge tone={SOURCE_STATUS_TONE[source.status] ?? "neutral"}>{source.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {source.lastCheckedAt ? source.lastCheckedAt.toLocaleString() : "Not available"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
