import { and, eq, sql } from "drizzle-orm";
import type { Db } from "../client";
import { articles, mentions, sources } from "../schema/content";
import { monitoringQueries } from "../schema/monitoring";
import type { OrganizationId } from "./tenant-scope";

export type AnalyticsScope = { projectId?: string; sinceDays: number };

function scopeWhere(organizationId: OrganizationId, scope: AnalyticsScope) {
  return and(
    eq(mentions.organizationId, organizationId),
    scope.projectId ? eq(mentions.projectId, scope.projectId) : undefined,
    sql`${mentions.createdAt} >= now() - (${scope.sinceDays}::text || ' days')::interval`,
  );
}

export type MentionVolumePoint = { date: string; count: number };

/**
 * docs/architecture/DATA_MODEL.md §Metrics — aggregated in the database.
 * Zero-filled via generate_series so the trend line has no gaps on days
 * with no mentions (a chart with holes reads as a bug, not "no data").
 */
export async function getMentionVolumeSeries(
  db: Db,
  organizationId: OrganizationId,
  scope: AnalyticsScope,
): Promise<MentionVolumePoint[]> {
  const rows = await db.execute<{ date: string; count: number }>(sql`
    select
      to_char(day::date, 'YYYY-MM-DD') as date,
      count(m.id)::int as count
    from generate_series(
      now()::date - (${scope.sinceDays}::text || ' days')::interval,
      now()::date,
      '1 day'::interval
    ) as day
    left join ${mentions} m
      on m.created_at::date = day::date
      and m.organization_id = ${organizationId}
      ${scope.projectId ? sql`and m.project_id = ${scope.projectId}` : sql``}
    group by day
    order by day
  `);
  return rows.rows;
}

export type SentimentTrendPoint = {
  date: string;
  positive: number;
  neutral: number;
  negative: number;
  unclassified: number;
};

export async function getSentimentTrendSeries(
  db: Db,
  organizationId: OrganizationId,
  scope: AnalyticsScope,
): Promise<SentimentTrendPoint[]> {
  const rows = await db.execute<SentimentTrendPoint>(sql`
    select
      to_char(day::date, 'YYYY-MM-DD') as date,
      count(*) filter (where m.sentiment = 'positive')::int as positive,
      count(*) filter (where m.sentiment = 'neutral')::int as neutral,
      count(*) filter (where m.sentiment = 'negative')::int as negative,
      count(*) filter (where m.sentiment is null and m.id is not null)::int as unclassified
    from generate_series(
      now()::date - (${scope.sinceDays}::text || ' days')::interval,
      now()::date,
      '1 day'::interval
    ) as day
    left join ${mentions} m
      on m.created_at::date = day::date
      and m.organization_id = ${organizationId}
      ${scope.projectId ? sql`and m.project_id = ${scope.projectId}` : sql``}
    group by day
    order by day
  `);
  return rows.rows;
}

export type SourceDistributionRow = { sourceName: string; count: number };

export async function getSourceDistribution(
  db: Db,
  organizationId: OrganizationId,
  scope: AnalyticsScope,
  limit = 10,
): Promise<SourceDistributionRow[]> {
  return db
    .select({ sourceName: sources.name, count: sql<number>`count(*)::int` })
    .from(mentions)
    .innerJoin(articles, eq(articles.id, mentions.articleId))
    .innerJoin(sources, eq(sources.id, articles.sourceId))
    .where(scopeWhere(organizationId, scope))
    .groupBy(sources.name)
    .orderBy(sql`count(*) desc`)
    .limit(limit);
}

export type TopicRow = {
  queryId: string;
  queryName: string;
  currentCount: number;
  previousCount: number;
};

/**
 * "Topics" here means monitoring queries, not AI-clustered narratives —
 * true AI topic detection is Phase 6 (docs/architecture/AI_ARCHITECTURE.md).
 * This is grounded in what the org actually tracks, never fabricated.
 */
export async function getTopicBreakdown(
  db: Db,
  organizationId: OrganizationId,
  scope: AnalyticsScope,
): Promise<TopicRow[]> {
  const rows = await db.execute<TopicRow>(sql`
    select
      q.id as "queryId",
      q.name as "queryName",
      count(*) filter (
        where m.created_at >= now() - (${scope.sinceDays}::text || ' days')::interval
      )::int as "currentCount",
      count(*) filter (
        where m.created_at < now() - (${scope.sinceDays}::text || ' days')::interval
        and m.created_at >= now() - (${scope.sinceDays * 2}::text || ' days')::interval
      )::int as "previousCount"
    from ${monitoringQueries} q
    left join ${mentions} m
      on m.query_id = q.id
      and m.created_at >= now() - (${scope.sinceDays * 2}::text || ' days')::interval
    where q.organization_id = ${organizationId}
      and q.deleted_at is null
      ${scope.projectId ? sql`and q.project_id = ${scope.projectId}` : sql``}
    group by q.id, q.name
    order by "currentCount" desc
  `);
  return rows.rows;
}
