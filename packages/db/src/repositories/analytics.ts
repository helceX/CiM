import { and, eq, sql } from "drizzle-orm";
import type { Db } from "../client";
import { articles, mentions, sources } from "../schema/content";
import { monitoringQueries } from "../schema/monitoring";
import { mentionTopics, topics } from "../schema/ai";
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

export type QuerySpikeStats = {
  currentHourCount: number;
  baselineAvg: number;
  baselineStdDev: number;
};

/**
 * Transparent statistical baseline for spike alerts (brief §72 —
 * "Volume increased 4.2x compared to 30-day baseline" style explanation,
 * not an opaque AI score). 24 zero-filled trailing hourly buckets (the
 * current, still-in-progress hour is excluded from the baseline itself)
 * give a mean/stddev the alert engine compares the current hour against.
 */
export async function getQuerySpikeStats(
  db: Db,
  queryId: string,
): Promise<QuerySpikeStats> {
  const [row] = (
    await db.execute<{
      current_count: number;
      baseline_avg: string | null;
      baseline_stddev: string | null;
    }>(sql`
      with hours as (
        select generate_series(
          date_trunc('hour', now()) - interval '24 hours',
          date_trunc('hour', now()) - interval '1 hour',
          interval '1 hour'
        ) as hour
      ),
      hourly as (
        select h.hour, count(m.id) as cnt
        from hours h
        left join ${mentions} m
          on date_trunc('hour', m.created_at) = h.hour
          and m.query_id = ${queryId}
        group by h.hour
      ),
      current_hour as (
        select count(*) as cnt
        from ${mentions}
        where query_id = ${queryId}
          and created_at >= date_trunc('hour', now())
      )
      select
        (select cnt from current_hour) as current_count,
        avg(hourly.cnt) as baseline_avg,
        stddev_pop(hourly.cnt) as baseline_stddev
      from hourly
    `)
  ).rows;

  return {
    currentHourCount: Number(row?.current_count ?? 0),
    baselineAvg: Number(row?.baseline_avg ?? 0),
    baselineStdDev: Number(row?.baseline_stddev ?? 0),
  };
}

export type EmergingTopicStat = {
  topicId: string;
  topicName: string;
  currentCount: number;
  baselineAvgPerDay: number;
};

/**
 * Same transparent-baseline principle as getQuerySpikeStats/
 * getQuerySentimentShiftStats, applied per AI-derived topic
 * (docs/product/FEATURE_MATRIX.md P2 "Emerging topic" alert) — these are
 * `mentionTopics` rows from the worker's `ai_enrich` job
 * (docs/architecture/AI_ARCHITECTURE.md), real classified topics, never
 * the "topic = monitoring query" simplification getTopicBreakdown above
 * uses for the Analytics screen. One row per topic that appeared on this
 * query's mentions in the last 24 hours; a topic with zero baseline
 * history (never seen before this window) still gets a real row with
 * `baselineAvgPerDay: 0` — the caller's floor, not this query, decides
 * whether that counts as "emerging".
 */
export async function getEmergingTopicStats(
  db: Db,
  queryId: string,
): Promise<EmergingTopicStat[]> {
  const rows = await db.execute<{
    topic_id: string;
    topic_name: string;
    current_count: number;
    baseline_count: number;
  }>(sql`
    with current_counts as (
      select t.id as topic_id, t.name as topic_name, count(distinct m.id) as current_count
      from ${mentions} m
      join ${mentionTopics} mt on mt.mention_id = m.id
      join ${topics} t on t.id = mt.topic_id
      where m.query_id = ${queryId}
        and m.created_at >= now() - interval '24 hours'
      group by t.id, t.name
    ),
    baseline_counts as (
      select mt.topic_id, count(distinct m.id) as baseline_count
      from ${mentions} m
      join ${mentionTopics} mt on mt.mention_id = m.id
      where m.query_id = ${queryId}
        and m.created_at < now() - interval '24 hours'
        and m.created_at >= now() - interval '8 days'
      group by mt.topic_id
    )
    select
      cc.topic_id,
      cc.topic_name,
      cc.current_count,
      coalesce(bc.baseline_count, 0) as baseline_count
    from current_counts cc
    left join baseline_counts bc on bc.topic_id = cc.topic_id
    order by cc.current_count desc
  `);

  return rows.rows.map((row) => ({
    topicId: row.topic_id,
    topicName: row.topic_name,
    currentCount: Number(row.current_count),
    baselineAvgPerDay: Number(row.baseline_count) / 7,
  }));
}

export type QuerySentimentShiftStats = {
  currentClassifiedCount: number;
  currentNegativeShare: number;
  baselineClassifiedCount: number;
  baselineNegativeShare: number;
};

/**
 * Same transparent-baseline principle as getQuerySpikeStats, applied to
 * sentiment (docs/product/FEATURE_MATRIX.md P2 "Sentiment shift" alert):
 * what share of *classified* mentions (sentiment AI has actually scored —
 * unclassified ones are excluded from both windows, never counted as
 * negative by omission) were negative in the last 24 hours, compared to
 * the trailing 7 days before that.
 */
export async function getQuerySentimentShiftStats(
  db: Db,
  queryId: string,
): Promise<QuerySentimentShiftStats> {
  const [row] = (
    await db.execute<{
      current_classified: number;
      current_negative: number;
      baseline_classified: number;
      baseline_negative: number;
    }>(sql`
      select
        count(*) filter (
          where created_at >= now() - interval '24 hours' and sentiment is not null
        ) as current_classified,
        count(*) filter (
          where created_at >= now() - interval '24 hours' and sentiment = 'negative'
        ) as current_negative,
        count(*) filter (
          where created_at < now() - interval '24 hours'
            and created_at >= now() - interval '8 days'
            and sentiment is not null
        ) as baseline_classified,
        count(*) filter (
          where created_at < now() - interval '24 hours'
            and created_at >= now() - interval '8 days'
            and sentiment = 'negative'
        ) as baseline_negative
      from ${mentions}
      where query_id = ${queryId}
    `)
  ).rows;

  const currentClassifiedCount = Number(row?.current_classified ?? 0);
  const currentNegativeCount = Number(row?.current_negative ?? 0);
  const baselineClassifiedCount = Number(row?.baseline_classified ?? 0);
  const baselineNegativeCount = Number(row?.baseline_negative ?? 0);

  return {
    currentClassifiedCount,
    currentNegativeShare:
      currentClassifiedCount > 0 ? currentNegativeCount / currentClassifiedCount : 0,
    baselineClassifiedCount,
    baselineNegativeShare:
      baselineClassifiedCount > 0 ? baselineNegativeCount / baselineClassifiedCount : 0,
  };
}
