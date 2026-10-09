import Link from "next/link";
import { Badge, Button, EmptyState } from "@cim/ui";
import { Radar } from "lucide-react";
import { signalLevelLabel } from "@cim/core";
import {
  db,
  getBrandGroupComparison,
  getCompetitorComparison,
  getDashboardSummary,
  getLatestInsightForOrganization,
  getMentionVolumeSeries,
  listBrandMentions,
  listLatestRecommendationsForOrganization,
  listProjects,
  listRecentMentions,
} from "@cim/db";
import { requireOrgContext } from "@/lib/tenant";
import { getCurrentUser } from "@/lib/session";
import { KpiRow } from "@/components/kpi-row";
import { MentionTrendChart } from "@/components/charts/mention-trend-chart";
import { AiAssistantPanel } from "./ai-assistant-panel";
import { CompetitorComparisonSection } from "./competitor-comparison-section";
import { BrandGroupComparisonSection } from "./brand-group-comparison-section";
import { RecommendationsSection } from "./recommendations-section";
import { RiskBanner } from "./risk-banner";
import { PinnedVisualsSection } from "./pinned-visuals-section";

// A "risk" insight row is only ever created when detectRisk actually
// flags something (most periods produce nothing), unlike "whats_changed"
// which refreshes daily whenever there's coverage — so without a cutoff
// the danger-styled RiskBanner could keep showing a resolved risk from
// weeks ago as if it were still live. Same 24h window
// apps/worker/src/jobs/send-executive-brief.ts already applies before
// emailing a "whats_changed" brief.
const RISK_FRESHNESS_HOURS = 24;

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
  const [projects, user] = await Promise.all([
    listProjects(db, context.organizationId),
    getCurrentUser(),
  ]);

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

  const [
    summary,
    recentMentions,
    trend,
    insight,
    competitorComparison,
    recommendations,
    risk,
    brandGroupComparison,
    brand,
  ] = await Promise.all([
    getDashboardSummary(db, context.organizationId, { sinceDays: 7 }),
    listRecentMentions(db, context.organizationId, { limit: 10 }),
    getMentionVolumeSeries(db, context.organizationId, { sinceDays: 14 }),
    getLatestInsightForOrganization(db, context.organizationId, "whats_changed"),
    getCompetitorComparison(db, context.organizationId, { sinceDays: 7 }),
    listLatestRecommendationsForOrganization(db, context.organizationId),
    getLatestInsightForOrganization(db, context.organizationId, "risk", {
      freshSince: new Date(Date.now() - RISK_FRESHNESS_HOURS * 60 * 60 * 1000),
    }),
    getBrandGroupComparison(db, context.organizationId, { sinceDays: 7 }),
    listBrandMentions(db, context.organizationId, { limit: 8, sinceDays: 30 }),
  ]);
  const hasCompetitor = competitorComparison.some(
    (row) => row.trackingTarget === "competitor",
  );
  // AI_ARCHITECTURE.md Trust Layer — an Insight with zero evidence rows is
  // never rendered (send-executive-brief.ts applies the same filter to
  // "whats_changed" before emailing it). Reachable here too: evidence rows
  // cascade-delete with their Mention (schema/ai.ts), and unlike "risk"'s
  // own 24h freshness window, a recommendation has no staleness bound —
  // a dormant project's months-old recommendation can outlive its own
  // evidence once retention (30+ days minimum) catches up to it.
  const evidencedRecommendations = recommendations.filter(
    (item) => item.evidence.length > 0,
  );

  return (
    <div className="flex flex-col gap-8">
      <header className="mp-hero p-6 md:p-8">
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {context.organizationName} · last 7 days · {projects.length} project
              {projects.length === 1 ? "" : "s"}
            </p>
            <h1 className="mt-2">
              <span className="sr-only">Dashboard — </span>
              {user ? `Hello, ${user.firstName}.` : "Dashboard"}{" "}
              <span className="mp-gradient-text">Here&apos;s what changed.</span>
            </h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm">
              <Link href="/monitoring/new">New monitoring</Link>
            </Button>
            <Button asChild size="sm" variant="secondary">
              <Link href="/mentions">Open mentions</Link>
            </Button>
          </div>
        </div>
      </header>

      <KpiRow
        items={[
          { label: "Total mentions", value: String(summary.totalMentions) },
          { label: "Unique sources", value: String(summary.uniqueSources) },
          { label: "High priority", value: String(summary.highPriority) },
          {
            label: "Sentiment mix",
            value:
              summary.totalMentions > 0
                ? `${Math.round((summary.positive / summary.totalMentions) * 100)}% positive`
                : "—",
            hint: `${summary.neutral} neutral · ${summary.negative} negative`,
          },
        ]}
      />

      {risk && risk.evidence.length > 0 ? <RiskBanner risk={risk} /> : null}

      {insight && insight.evidence.length > 0 ? (
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
              Based on {insight.evidence.length} mention
              {insight.evidence.length === 1 ? "" : "s"}
            </span>
          </div>
        </section>
      ) : null}

      {evidencedRecommendations.length > 0 ? (
        <RecommendationsSection items={evidencedRecommendations} />
      ) : null}

      <AiAssistantPanel />

      {summary.totalMentions > 0 ? (
        <section className="rounded-lg border border-border p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Mention trend</h2>
            <Link
              href="/analytics"
              className="text-xs text-primary underline underline-offset-2"
            >
              View analytics
            </Link>
          </div>
          <p className="text-xs text-muted-foreground">Last 14 days.</p>
          <div className="mt-2">
            <MentionTrendChart data={trend} />
          </div>
        </section>
      ) : null}

      {brandGroupComparison.length > 0 ? (
        <BrandGroupComparisonSection rows={brandGroupComparison} />
      ) : null}

      {hasCompetitor ? (
        <CompetitorComparisonSection rows={competitorComparison} />
      ) : null}

      <PinnedVisualsSection organizationId={context.organizationId} />

      {brand.names.length > 0 ? (
        <section aria-labelledby="your-brand-heading">
          <div className="flex items-center justify-between">
            <h2 id="your-brand-heading" className="text-sm font-semibold text-foreground">
              Your brand in the news
            </h2>
            <Link href="/mentions" className="text-xs text-primary underline underline-offset-2">
              View all mentions
            </Link>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Stories that name{" "}
            <strong className="font-semibold text-foreground">{brand.names.join(" · ")}</strong> directly — last 30 days.
          </p>
          <div className="mt-3 overflow-hidden rounded-lg border border-border">
            {brand.items.length === 0 ? (
              <EmptyState
                title="No story names your company yet"
                description="Stories show up here the moment a source writes your company's name in a headline or its first lines."
                className="border-none"
              />
            ) : (
              <ul className="divide-y divide-border">
                {brand.items.map(({ mention, article, source, matchedName, where }) => (
                  <li key={mention.id} className="flex flex-col gap-1 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-foreground">
                        <Link
                          href={`/mentions?open=${mention.id}`}
                          className="hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          {article.title}
                        </Link>
                      </p>
                      {mention.sentiment ? (
                        <Badge tone={SENTIMENT_TONE[mention.sentiment as keyof typeof SENTIMENT_TONE]}>{mention.sentiment}</Badge>
                      ) : null}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {source.name}
                      {article.publishedAt ? ` · ${new Date(article.publishedAt).toLocaleDateString()}` : ""} · names{" "}
                      <span className="text-foreground">{matchedName}</span> in the {where}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      ) : (
        <section aria-labelledby="top-stories-heading">
          <div className="flex items-center justify-between">
            <h2 id="top-stories-heading" className="text-sm font-semibold text-foreground">Latest stories</h2>
            <Link href="/mentions" className="text-xs text-primary underline underline-offset-2">
              View all mentions
            </Link>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Add your company&apos;s name (and its short name) to a monitoring to see here the stories that name you
            directly.{" "}
            <Link href="/monitoring" className="text-primary underline underline-offset-2">
              Open monitoring
            </Link>
          </p>
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
                    <p className="text-sm font-medium text-foreground">
                      <Link
                        href={`/mentions?open=${mention.id}`}
                        className="hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        {article.title}
                      </Link>
                    </p>
                    <div className="flex shrink-0 items-center gap-2">
                      {mention.sentiment ? (
                        <Badge
                          tone={
                            SENTIMENT_TONE[
                              mention.sentiment as keyof typeof SENTIMENT_TONE
                            ]
                          }
                        >
                          {mention.sentiment}
                        </Badge>
                      ) : (
                        <Badge tone="neutral">Unclassified</Badge>
                      )}
                      <Badge
                        tone={
                          PRIORITY_TONE[mention.priority as keyof typeof PRIORITY_TONE]
                        }
                      >
                        {signalLevelLabel(mention.priority)}
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
      )}
    </div>
  );
}
