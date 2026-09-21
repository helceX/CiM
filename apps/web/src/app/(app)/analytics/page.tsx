import { Badge, EmptyState } from "@cim/ui";
import { BarChart3 } from "lucide-react";
import {
  db,
  getMentionVolumeSeries,
  getSentimentTrendSeries,
  getSourceDistribution,
  getTopicBreakdown,
} from "@cim/db";
import { requireOrgContext } from "@/lib/tenant";
import { MentionTrendChart } from "@/components/charts/mention-trend-chart";
import { SentimentTrendChart } from "@/components/charts/sentiment-trend-chart";
import { DistributionBarChart } from "@/components/charts/distribution-bar-chart";
import { RangeSelect } from "./range-select";

const VALID_RANGES = [7, 30, 90];

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ since?: string }>;
}) {
  const context = await requireOrgContext();
  const resolved = await searchParams;
  const sinceDaysRaw = Number(resolved.since ?? "30");
  const sinceDays = VALID_RANGES.includes(sinceDaysRaw) ? sinceDaysRaw : 30;

  const [volume, sentimentTrend, sourceDistribution, topics] = await Promise.all([
    getMentionVolumeSeries(db, context.organizationId, { sinceDays }),
    getSentimentTrendSeries(db, context.organizationId, { sinceDays }),
    getSourceDistribution(db, context.organizationId, { sinceDays }),
    getTopicBreakdown(db, context.organizationId, { sinceDays }),
  ]);

  const totalMentions = volume.reduce((sum, point) => sum + point.count, 0);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Analytics</h1>
          <p className="text-sm text-muted-foreground">
            Mention volume, sentiment, sources, and topics over time.
          </p>
        </div>
        <RangeSelect current={sinceDays} />
      </div>

      {totalMentions === 0 ? (
        <EmptyState
          icon={<BarChart3 className="size-8" aria-hidden="true" />}
          title="No mentions in this period yet."
          description="Charts will populate once monitoring queries start matching content."
        />
      ) : (
        <>
          <section className="rounded-lg border border-border p-4">
            <h2 className="text-sm font-semibold text-foreground">Mention volume</h2>
            <p className="text-xs text-muted-foreground">
              {totalMentions} mention{totalMentions === 1 ? "" : "s"} over the last{" "}
              {sinceDays} days.
            </p>
            <div className="mt-3">
              <MentionTrendChart data={volume} />
            </div>
          </section>

          <section className="rounded-lg border border-border p-4">
            <h2 className="text-sm font-semibold text-foreground">Sentiment trend</h2>
            <p className="text-xs text-muted-foreground">
              From AI enrichment (sentiment, entities, topics per mention). Mentions AI
              hasn&apos;t analyzed yet — or ran without an AI provider configured — show
              as unclassified, never guessed.
            </p>
            <div className="mt-3">
              <SentimentTrendChart data={sentimentTrend} />
            </div>
          </section>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <section className="rounded-lg border border-border p-4">
              <h2 className="text-sm font-semibold text-foreground">
                Source distribution
              </h2>
              <p className="text-xs text-muted-foreground">
                Top sources by mention count.
              </p>
              <div className="mt-3">
                {sourceDistribution.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No sources in this period.
                  </p>
                ) : (
                  <DistributionBarChart
                    data={sourceDistribution.map((s) => ({
                      label: s.sourceName,
                      value: s.count,
                    }))}
                  />
                )}
              </div>
            </section>

            <section className="rounded-lg border border-border p-4">
              <h2 className="text-sm font-semibold text-foreground">Topics</h2>
              <p className="text-xs text-muted-foreground">
                Grouped by monitoring query — not AI-clustered narratives.
              </p>
              <div className="mt-3 flex flex-col gap-2">
                {topics.filter((t) => t.currentCount > 0).length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No topic activity in this period.
                  </p>
                ) : (
                  topics
                    .filter((t) => t.currentCount > 0)
                    .map((topic) => (
                      <div
                        key={topic.queryId}
                        className="flex items-center justify-between text-sm"
                      >
                        <span className="text-foreground">{topic.queryName}</span>
                        <span className="flex items-center gap-2">
                          <span className="text-muted-foreground">
                            {topic.currentCount}
                          </span>
                          <ChangeBadge
                            current={topic.currentCount}
                            previous={topic.previousCount}
                          />
                        </span>
                      </div>
                    ))
                )}
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function ChangeBadge({ current, previous }: { current: number; previous: number }) {
  if (previous === 0) {
    return current > 0 ? <Badge tone="info">New</Badge> : null;
  }
  const change = Math.round(((current - previous) / previous) * 100);
  if (change === 0) return <Badge tone="neutral">No change</Badge>;
  return (
    <Badge tone={change > 0 ? "success" : "danger"}>
      {change > 0 ? "+" : ""}
      {change}%
    </Badge>
  );
}
