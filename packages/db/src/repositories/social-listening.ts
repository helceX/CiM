import { and, eq, sql } from "drizzle-orm";
import type { Db } from "../client";
import { articles, mentions, sources } from "../schema/content";
import { socialProfiles } from "../schema/social";
import type { OrganizationId } from "./tenant-scope";

export type SocialScope = { projectId?: string; sinceDays: number };

/**
 * docs/architecture/ADR-006-SOCIAL-LISTENING.md — every query here scopes
 * to `sources.type = 'social'`, the same "social content is Article, not
 * a new top-level entity" decision the ADR made: there is no separate
 * social_mentions table to query against.
 */
function socialScopeWhere(organizationId: OrganizationId, scope: SocialScope) {
  return and(
    eq(mentions.organizationId, organizationId),
    eq(sources.type, "social"),
    scope.projectId ? eq(mentions.projectId, scope.projectId) : undefined,
    sql`${mentions.createdAt} >= now() - (${scope.sinceDays}::text || ' days')::interval`,
  );
}

export type SocialOverviewStats = {
  totalConversations: number;
  directMentions: number;
  uniqueAuthors: number;
};

/**
 * master prompt §47 "Social Listening Overview" KPIs. Only the KPIs this
 * pipeline can actually compute today are included — Engagement/Reach/
 * Engagement Velocity and "Unprompted Conversations" are deliberately
 * left out of this MVP slice rather than shown as zero/fabricated:
 * engagementMetrics isn't populated by MockSocialConnector yet, and
 * semantic-match detection (the only honest source for "unprompted") is
 * an AI capability not yet built (ADR-006 §4).
 */
export async function getSocialOverviewStats(
  db: Db,
  organizationId: OrganizationId,
  scope: SocialScope,
): Promise<SocialOverviewStats> {
  const [row] = await db
    .select({
      totalConversations: sql<number>`count(distinct ${mentions.id})::int`,
      directMentions: sql<number>`count(distinct ${mentions.id}) filter (where ${mentions.matchType} = 'direct_mention')::int`,
      uniqueAuthors: sql<number>`count(distinct ${articles.authorProfileId})::int`,
    })
    .from(mentions)
    .innerJoin(articles, eq(articles.id, mentions.articleId))
    .innerJoin(sources, eq(sources.id, articles.sourceId))
    .where(socialScopeWhere(organizationId, scope));
  return (
    row ?? { totalConversations: 0, directMentions: 0, uniqueAuthors: 0 }
  );
}

export type SocialPlatformCount = { platform: string; count: number };

export async function getSocialPlatformDistribution(
  db: Db,
  organizationId: OrganizationId,
  scope: SocialScope,
): Promise<SocialPlatformCount[]> {
  return db
    .select({
      // A social article with no linked author profile (a connector
      // that didn't report one) still counts — grouped as "unknown"
      // rather than silently dropped from the distribution.
      platform: sql<string>`coalesce(${socialProfiles.platform}, 'unknown')`,
      count: sql<number>`count(distinct ${mentions.id})::int`,
    })
    .from(mentions)
    .innerJoin(articles, eq(articles.id, mentions.articleId))
    .innerJoin(sources, eq(sources.id, articles.sourceId))
    .leftJoin(socialProfiles, eq(socialProfiles.id, articles.authorProfileId))
    .where(socialScopeWhere(organizationId, scope))
    .groupBy(sql`coalesce(${socialProfiles.platform}, 'unknown')`)
    .orderBy(sql`count(distinct ${mentions.id}) desc`);
}

export type SocialSentimentBreakdown = {
  positive: number;
  neutral: number;
  negative: number;
  unclassified: number;
};

export async function getSocialSentimentBreakdown(
  db: Db,
  organizationId: OrganizationId,
  scope: SocialScope,
): Promise<SocialSentimentBreakdown> {
  const [row] = await db
    .select({
      positive: sql<number>`count(*) filter (where ${mentions.sentiment} = 'positive')::int`,
      neutral: sql<number>`count(*) filter (where ${mentions.sentiment} = 'neutral')::int`,
      negative: sql<number>`count(*) filter (where ${mentions.sentiment} = 'negative')::int`,
      unclassified: sql<number>`count(*) filter (where ${mentions.sentiment} is null)::int`,
    })
    .from(mentions)
    .innerJoin(articles, eq(articles.id, mentions.articleId))
    .innerJoin(sources, eq(sources.id, articles.sourceId))
    .where(socialScopeWhere(organizationId, scope));
  return row ?? { positive: 0, neutral: 0, negative: 0, unclassified: 0 };
}

export type TrendingHashtag = {
  hashtag: string;
  currentCount: number;
  previousCount: number;
};

/**
 * Same transparent current-vs-previous-period baseline convention as
 * analytics.ts's getTopicBreakdown — grouped by the literal matched
 * hashtag term (mentions.matchedRule/matchType = 'hashtag'), not an AI
 * cluster, so every number here traces back to a real matched mention.
 */
export async function getTrendingHashtags(
  db: Db,
  organizationId: OrganizationId,
  scope: SocialScope,
  limit = 10,
): Promise<TrendingHashtag[]> {
  const rows = await db.execute<{
    hashtag: string;
    current_count: number;
    previous_count: number;
  }>(sql`
    select
      unnest(m.matched_terms) as hashtag,
      count(*) filter (
        where m.created_at >= now() - (${scope.sinceDays}::text || ' days')::interval
      )::int as current_count,
      count(*) filter (
        where m.created_at < now() - (${scope.sinceDays}::text || ' days')::interval
        and m.created_at >= now() - (${scope.sinceDays * 2}::text || ' days')::interval
      )::int as previous_count
    from ${mentions} m
    inner join ${articles} a on a.id = m.article_id
    inner join ${sources} s on s.id = a.source_id
    where m.organization_id = ${organizationId}
      and s.type = 'social'
      and m.match_type = 'hashtag'
      ${scope.projectId ? sql`and m.project_id = ${scope.projectId}` : sql``}
      and m.created_at >= now() - (${scope.sinceDays * 2}::text || ' days')::interval
    group by hashtag
    order by current_count desc
    limit ${limit}
  `);
  return rows.rows.map((row) => ({
    hashtag: row.hashtag,
    currentCount: Number(row.current_count),
    previousCount: Number(row.previous_count),
  }));
}

export type TopSocialAuthor = {
  profileId: string;
  platform: string;
  handle: string;
  displayName: string | null;
  followers: number | null;
  verified: boolean | null;
  mentionCount: number;
};

export async function getTopSocialAuthors(
  db: Db,
  organizationId: OrganizationId,
  scope: SocialScope,
  limit = 10,
): Promise<TopSocialAuthor[]> {
  return db
    .select({
      profileId: socialProfiles.id,
      platform: socialProfiles.platform,
      handle: socialProfiles.handle,
      displayName: socialProfiles.displayName,
      followers: socialProfiles.followers,
      verified: socialProfiles.verified,
      mentionCount: sql<number>`count(distinct ${mentions.id})::int`,
    })
    .from(mentions)
    .innerJoin(articles, eq(articles.id, mentions.articleId))
    .innerJoin(sources, eq(sources.id, articles.sourceId))
    .innerJoin(socialProfiles, eq(socialProfiles.id, articles.authorProfileId))
    .where(socialScopeWhere(organizationId, scope))
    .groupBy(
      socialProfiles.id,
      socialProfiles.platform,
      socialProfiles.handle,
      socialProfiles.displayName,
      socialProfiles.followers,
      socialProfiles.verified,
    )
    .orderBy(sql`count(distinct ${mentions.id}) desc`)
    .limit(limit);
}

export type TopSocialPost = {
  mentionId: string;
  articleId: string;
  title: string;
  canonicalUrl: string;
  authorHandle: string | null;
  priority: string;
  createdAt: Date;
};

/**
 * "Top" is ordered by the mention's own transparent priority signal
 * (computeMatchPriority — exact-phrase match, never a fabricated
 * engagement score) then recency — engagementMetrics isn't populated by
 * MockSocialConnector yet, so ranking by "engagement" would mean ranking
 * by zero for every row, which is worse than being honest about what
 * this ordering actually reflects (brief §182–184).
 */
export async function getTopSocialPosts(
  db: Db,
  organizationId: OrganizationId,
  scope: SocialScope,
  limit = 10,
): Promise<TopSocialPost[]> {
  return db
    .select({
      mentionId: mentions.id,
      articleId: articles.id,
      title: articles.title,
      canonicalUrl: articles.canonicalUrl,
      authorHandle: socialProfiles.handle,
      priority: mentions.priority,
      createdAt: mentions.createdAt,
    })
    .from(mentions)
    .innerJoin(articles, eq(articles.id, mentions.articleId))
    .innerJoin(sources, eq(sources.id, articles.sourceId))
    .leftJoin(socialProfiles, eq(socialProfiles.id, articles.authorProfileId))
    .where(socialScopeWhere(organizationId, scope))
    .orderBy(
      sql`case ${mentions.priority}
        when 'critical' then 0 when 'high' then 1 when 'normal' then 2 else 3 end`,
      sql`${mentions.createdAt} desc`,
    )
    .limit(limit);
}
