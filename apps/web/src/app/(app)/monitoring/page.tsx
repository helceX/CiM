import Link from "next/link";
import { Badge, Button, EmptyState } from "@cim/ui";
import { Radar } from "lucide-react";
import { db, listMonitoringQueries } from "@cim/db";
import { requireOrgContext } from "@/lib/tenant";

export default async function MonitoringListPage() {
  const context = await requireOrgContext();
  const queries = await listMonitoringQueries(db, context.organizationId);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Monitoring</h1>
          <p className="text-sm text-muted-foreground">Queries tracking your brands, competitors, and topics.</p>
        </div>
        <Button asChild size="sm">
          <Link href="/monitoring/new">New monitoring</Link>
        </Button>
      </div>

      {queries.length === 0 ? (
        <EmptyState
          icon={<Radar className="size-8" aria-hidden="true" />}
          title="No monitoring has been created yet."
          description="Try tracking your brand, campaign, or a competitor."
          action={
            <Button asChild size="sm">
              <Link href="/monitoring/new">Create your first monitoring query</Link>
            </Button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-surface-muted text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Query</th>
                <th className="px-4 py-2 font-medium">Sources</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {queries.map((query) => (
                <tr key={query.id}>
                  <td className="px-4 py-3 font-medium text-foreground">{query.name}</td>
                  <td className="max-w-xs truncate px-4 py-3 text-muted-foreground">
                    {query.booleanQuery}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {query.sourceTypes.join(", ")}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={query.status === "active" ? "success" : "neutral"}>
                      {query.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(query.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
