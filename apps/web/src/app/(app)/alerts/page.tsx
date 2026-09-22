import Link from "next/link";
import { Badge, Button, EmptyState } from "@cim/ui";
import { BellRing } from "lucide-react";
import { db, listAlertRules } from "@cim/db";
import { requireOrgContext } from "@/lib/tenant";

const TYPE_LABEL: Record<string, string> = {
  keyword: "Keyword",
  high_relevance: "High relevance",
  spike: "Spike",
  sentiment_shift: "Sentiment shift",
  emerging_topic: "Emerging topic",
};

export default async function AlertsListPage() {
  const context = await requireOrgContext();
  const rules = await listAlertRules(db, context.organizationId);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Alerts</h1>
          <p className="text-sm text-muted-foreground">
            Get notified when a monitoring query matches, matches strongly, or spikes.
          </p>
        </div>
        <Button asChild size="sm">
          <Link href="/alerts/new">New alert</Link>
        </Button>
      </div>

      {rules.length === 0 ? (
        <EmptyState
          icon={<BellRing className="size-8" aria-hidden="true" />}
          title="No alert rules yet."
          description="Create one to get notified when a monitoring query matches new content."
          action={
            <Button asChild size="sm">
              <Link href="/alerts/new">Create your first alert</Link>
            </Button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-surface-muted text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Type</th>
                <th className="px-4 py-2 font-medium">Query</th>
                <th className="px-4 py-2 font-medium">Channels</th>
                <th className="px-4 py-2 font-medium">Cooldown</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rules.map(({ rule, queryName }) => (
                <tr key={rule.id}>
                  <td className="px-4 py-3 font-medium text-foreground">{rule.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {TYPE_LABEL[rule.type] ?? rule.type}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{queryName}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {rule.channels.join(", ")}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {rule.cooldownMinutes}m
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={rule.status === "active" ? "success" : "neutral"}>
                      {rule.status}
                    </Badge>
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
