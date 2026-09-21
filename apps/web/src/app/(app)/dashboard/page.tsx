import Link from "next/link";
import { Badge, Button, EmptyState } from "@cim/ui";
import { Radar } from "lucide-react";
import {
  db,
  getDashboardSummary,
  getLatestInsightForOrganization,
  getMentionVolumeSeries,
  listProjects,
  listRecentMentions,
} from "@cim/db";
import { requireOrgContext } from "@/lib/tenant";
import { KpiRow } from "@/components/kpi-row";
import { MentionTrendChart } from "@/components/charts/mention-trend-chart";

const SENTIMENT_TONE = {
  positive: "success",
  neutral: "neutral",
  negative: "danger",
} as const;

const PRIORITY_TONE = {
  low: "neutral",
  normal: "neutral",
  high: "warning",
  critical: "danger",
} as const;

export default async function DashboardPage() {
  const context = await requireOrgContext();
  const projects = await listProjects(db, context.organizationId);

  if (projects.length === 0) {
    return (
      <EmptyState
        icon={<Radar className="size-8" aria-hidden="true" />}
        title="No monitoring has been created yet."
        description="Track your brand, a competitor, or an industry topic to start seeing mentions here."
        action={
          <Button asChild size="sm">
            <Link href="/onboarding">Create your first monitoring</Link>
          </Button>
        }
      />
    );
  }

  const [summary, recentMentions, trend, insight] = await Promise.all([
    getDashboardSummary(db, context.organizationId, { sinceDays: 7 }),
    listRecentMentions(db, context.organizationId, { limit: 10 }),
    getMentionVolumeSeries(db, context.organizationId, { sinceDays: 14 }),
    getLatestInsightForOrganization(db, context.organizationId, "whats_changed"),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Last 7 days across {projects.length} project{projects.length === 1 ? "" : "s"}.</p>
      </div>

      <KpiRow
        items={[
          { label: "Total mentions", value: String(summary.totalMentions) },
          { label: "Unique sources", value: String(summary.uniqueSources) },
          { label: "High priority", value: String(summary.highPriority) },
          {
            label: "Sentiment mix",
            value: `${summary.positive}/${summary.neutral}/${summary.negative}`,
            hint: "positive / neutral / negative",
          },
        ]}
      />

      {insight ? (
        <section className="rounded-lg border border-border p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Since yesterday</h2>
            <span className="text-xs text-muted-foreground">{insight.projectName}</span>
          </div>
          <p className="mt-2 text-sm text-foreground">{insight.summary}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>Confidence {Math.round(Number(insight.confidence) * 100)}%</span>
            <span>Method: {insight.method}</span>
            <span>
              Based on {insight.evidence.length} mention{insight.evidence.length === 1 ? "" : "s"}
            </span>
          </div>
        </section>
      ) : null}

      {summary.totalMentions > 0 ? (
        <section className="rounded-lg border border-border p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Mention trend</h2>
            <Link href="/analytics" className="text-xs text-primary underline underline-offset-2">
              View analytics
            </Link>
          </div>
          <p className="text-xs text-muted-foreground">Last 14 days.</p>
          <div className="mt-2">
            <MentionTrendChart data={trend} />
          </div>
        </section>
      ) : null}

      <section>
        <h2 className="text-sm font-semibold text-foreground">Top stories</h2>
        <div className="mt-3 overflow-hidden rounded-lg border border-border">
          {recentMentions.length === 0 ? (
            <EmptyState
              title="No mentions yet"
              description="New matches will appear here as sources are checked — this can take a few minutes for a newly created query."
              className="border-none"
            />
          ) : (
            <ul className="divide-y divide-border">
              {recentMentions.map(({ mention, article, source }) => (
                <li key={mention.id} className="flex flex-col gap-1 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-foreground">{article.title}</p>
                    <div className="flex shrink-0 items-center gap-2">
                      {mention.sentiment ? (
                        <Badge tone={SENTIMENT_TONE[mention.sentiment as keyof typeof SENTIMENT_TONE]}>
                          {mention.sentiment}
                        </Badge>
                      ) : (
                        <Badge tone="neutral">Unclassified</Badge>
                      )}
                      <Badge tone={PRIORITY_TONE[mention.priority as keyof typeof PRIORITY_TONE]}>
                        {mention.priority}
                      </Badge>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {source.name}
                    {article.publishedAt
                      ? ` · ${new Date(article.publishedAt).toLocaleDateString()}`
                      : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
