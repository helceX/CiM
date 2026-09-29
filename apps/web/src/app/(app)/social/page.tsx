import { Badge, EmptyState } from "@cim/ui";
import { Share2 } from "lucide-react";
import {
  db,
  getSocialOverviewStats,
  getSocialPlatformDistribution,
  getSocialSentimentBreakdown,
  getTopSocialAuthors,
  getTopSocialPosts,
  getTrendingHashtags,
} from "@cim/db";
import { requireOrgContext } from "@/lib/tenant";
import { ChangeBadge } from "@/components/change-badge";
import { DistributionBarChart } from "@/components/charts/distribution-bar-chart";
import { KpiRow } from "@/components/kpi-row";
import { RangeSelect } from "@/components/range-select";

const VALID_RANGES = [7, 30, 90];

const SENTIMENT_TONE = {
  positive: "success",
  neutral: "neutral",
  negative: "danger",
} as const;

/**
 * docs/ux/SCREEN_INVENTORY_V2.md "Social Listening Overview" — same
 * information hierarchy as the main Dashboard (what happened -> what
 * changed -> why it matters), scoped to social-sourced mentions
 * (docs/architecture/ADR-006-SOCIAL-LISTENING.md). Engagement/Reach and
 * "Unprompted Conversations" are intentionally absent from this MVP —
 * see getSocialOverviewStats's own docstring for why showing them now
 * would mean fabricating data.
 */
export default async function SocialListeningPage({
  searchParams,
}: {
  searchParams: Promise<{ since?: string }>;
}) {
  const context = await requireOrgContext();
  const resolved = await searchParams;
  const sinceDaysRaw = Number(resolved.since ?? "30");
  const sinceDays = VALID_RANGES.includes(sinceDaysRaw) ? sinceDaysRaw : 30;
  const scope = { sinceDays };

  const [overview, platforms, sentiment, hashtags, authors, posts] = await Promise.all([
    getSocialOverviewStats(db, context.organizationId, scope),
    getSocialPlatformDistribution(db, context.organizationId, scope),
    getSocialSentimentBreakdown(db, context.organizationId, scope),
    getTrendingHashtags(db, context.organizationId, scope),
    getTopSocialAuthors(db, context.organizationId, scope),
    getTopSocialPosts(db, context.organizationId, scope),
  ]);

  const sentimentTotal = sentiment.positive + sentiment.neutral + sentiment.negative + sentiment.unclassified;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Social Listening</h1>
          <p className="text-sm text-muted-foreground">
            Conversations, authors, and hashtags from social sources.
          </p>
        </div>
        <RangeSelect current={sinceDays} />
      </div>

      {overview.totalConversations === 0 ? (
        <EmptyState
          icon={<Share2 className="size-8" aria-hidden="true" />}
          title="No social conversations in this period yet."
          description="This fills in once a social source starts matching your monitoring queries."
        />
      ) : (
        <>
          <KpiRow
            items={[
              { label: "Total conversations", value: String(overview.totalConversations) },
              { label: "Direct mentions", value: String(overview.directMentions) },
              { label: "Unique authors", value: String(overview.uniqueAuthors) },
              {
                label: "Sentiment classified",
                value:
                  sentimentTotal > 0
                    ? `${Math.round(((sentimentTotal - sentiment.unclassified) / sentimentTotal) * 100)}%`
                    : "Not available",
              },
            ]}
          />

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <section className="rounded-lg border border-border p-4">
              <h2 className="text-sm font-semibold text-foreground">Platform distribution</h2>
              <p className="text-xs text-muted-foreground">
                Conversations by platform in this period.
              </p>
              <div className="mt-3">
                {platforms.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No platform activity in this period.</p>
                ) : (
                  <DistributionBarChart
                    data={platforms.map((p) => ({ label: p.platform, value: p.count }))}
                  />
                )}
              </div>
            </section>

            <section className="rounded-lg border border-border p-4">
              <h2 className="text-sm font-semibold text-foreground">Sentiment</h2>
              <p className="text-xs text-muted-foreground">
                From AI enrichment. Not-yet-analyzed conversations show as unclassified, never
                guessed.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {(["positive", "neutral", "negative", "unclassified"] as const).map((key) => (
                  <Badge
                    key={key}
                    tone={key === "unclassified" ? "neutral" : SENTIMENT_TONE[key]}
                  >
                    {key} · {sentiment[key]}
                  </Badge>
                ))}
              </div>
            </section>
          </div>

          <section className="rounded-lg border border-border p-4">
            <h2 className="text-sm font-semibold text-foreground">Trending hashtags</h2>
            <p className="text-xs text-muted-foreground">
              Hashtags matched by your monitoring queries, current vs. previous period.
            </p>
            <div className="mt-3 flex flex-col gap-2">
              {hashtags.length === 0 ? (
                <p className="text-sm text-muted-foreground">No hashtag matches in this period.</p>
              ) : (
                hashtags.map((h) => (
                  <div key={h.hashtag} className="flex items-center justify-between text-sm">
                    <span className="text-foreground">{h.hashtag}</span>
                    <span className="flex items-center gap-2">
                      <span className="text-muted-foreground">{h.currentCount}</span>
                      <ChangeBadge current={h.currentCount} previous={h.previousCount} />
                    </span>
                  </div>
                ))
              )}
            </div>
          </section>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <section className="rounded-lg border border-border p-4">
              <h2 className="text-sm font-semibold text-foreground">Top authors</h2>
              <p className="text-xs text-muted-foreground">By conversation count in this period.</p>
              <ul className="mt-3 flex flex-col gap-3">
                {authors.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No authors in this period.</p>
                ) : (
                  authors.map((author) => (
                    <li key={author.profileId} className="flex items-center justify-between text-sm">
                      <div>
                        <p className="text-foreground">
                          {author.displayName ?? author.handle}
                          {author.verified ? (
                            <Badge tone="info" className="ml-2">
                              Verified
                            </Badge>
                          ) : null}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {author.handle} ·{" "}
                          {author.followers !== null
                            ? `${author.followers.toLocaleString()} followers`
                            : "Followers unknown"}
                        </p>
                      </div>
                      <span className="text-muted-foreground">{author.mentionCount}</span>
                    </li>
                  ))
                )}
              </ul>
            </section>

            <section className="rounded-lg border border-border p-4">
              <h2 className="text-sm font-semibold text-foreground">Top posts</h2>
              <p className="text-xs text-muted-foreground">
                Ranked by match priority, most recent first — engagement metrics not available
                for this source.
              </p>
              <ul className="mt-3 flex flex-col gap-3">
                {posts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No posts in this period.</p>
                ) : (
                  posts.map((post) => (
                    <li key={post.mentionId} className="text-sm">
                      <a
                        href={post.canonicalUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="text-primary underline underline-offset-2"
                      >
                        {post.title}
                      </a>
                      <p className="text-xs text-muted-foreground">
                        {post.authorHandle ?? "Unknown author"} ·{" "}
                        {new Date(post.createdAt).toLocaleDateString()}
                      </p>
                    </li>
                  ))
                )}
              </ul>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
