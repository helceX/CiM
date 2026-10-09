import { and, count, eq, gte, inArray, isNull, sql } from "drizzle-orm";
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

export type SourceTypeDistributionRow = { sourceType: string; count: number };

/**
 * docs/product/FEATURE_MATRIX.md P2 "Dashboard: ... source distribution
 * depth" — `sources.type` (news/blog/tv/social/podcast/…) has existed
 * since Phase 1's schema and is populated on every source, but until now
 * nothing read it back; `getSourceDistribution` above only ever grouped
 * by name. This is the same mention-count aggregation, grouped by the
 * source's type instead, so "which kinds of outlets are covering us" is
 * answerable alongside "which specific outlets."
 */
export async function getSourceTypeDistribution(
  db: Db,
  organizationId: OrganizationId,
  scope: AnalyticsScope,
): Promise<SourceTypeDistributionRow[]> {
  return db
    .select({ sourceType: sources.type, count: sql<number>`count(*)::int` })
    .from(mentions)
    .innerJoin(articles, eq(articles.id, mentions.articleId))
    .innerJoin(sources, eq(sources.id, articles.sourceId))
    .where(scopeWhere(organizationId, scope))
    .groupBy(sources.type)
    .orderBy(sql`count(*) desc`);
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
  // One pass over the last 25 hours of this query's mentions (the (query_id, created_at) index), bucketed by hour;
  // the 24 baseline hours are zero-filled afterwards so an empty hour still counts as 0 in the mean and deviation.
  // (The earlier form joined 24 generated hours to every mention of the query on date_trunc(created_at), which
  // cannot use an index and read the query's whole history, twice.)
  const [row] = (
    await db.execute<{
      current_count: number;
      baseline_avg: string | null;
      baseline_stddev: string | null;
    }>(sql`
      with buckets as (
        select date_trunc('hour', created_at) as hour, count(*)::int as cnt
        from ${mentions}
        where query_id = ${queryId}
          and created_at >= date_trunc('hour', now()) - interval '24 hours'
        group by 1
      ),
      hourly as (
        select coalesce(b.cnt, 0) as cnt
        from generate_series(
          date_trunc('hour', now()) - interval '24 hours',
          date_trunc('hour', now()) - interval '1 hour',
          interval '1 hour'
        ) as h(hour)
        left join buckets b on b.hour = h.hour
      )
      select
        coalesce((select cnt from buckets where hour = date_trunc('hour', now())), 0) as current_count,
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

const ID_CHUNK = 1000;

/**
 * Which of these monitoring queries already have at least `minCount` mentions in the current hour — one grouped
 * read instead of one statistics query per rule. The spike evaluator ignores every query below its own floor
 * (`currentHourCount < MIN_ABSOLUTE_COUNT`), so skipping them here changes nothing but the work done.
 */
export async function getQueryIdsWithCurrentHourMentions(db: Db, queryIds: string[], minCount: number): Promise<Set<string>> {
  const found = new Set<string>();
  for (let i = 0; i < queryIds.length; i += ID_CHUNK) {
    const rows = await db
      .select({ queryId: mentions.queryId })
      .from(mentions)
      .where(and(inArray(mentions.queryId, queryIds.slice(i, i + ID_CHUNK)), gte(mentions.createdAt, sql`date_trunc('hour', now())`)))
      .groupBy(mentions.queryId)
      .having(sql`count(*) >= ${minCount}`);
    for (const row of rows) found.add(row.queryId);
  }
  return found;
}

/** Same for the sentiment-shift floor: at least `minCount` mentions in the last 24 hours that sentiment analysis has scored. */
export async function getQueryIdsWithClassifiedMentions(db: Db, queryIds: string[], minCount: number): Promise<Set<string>> {
  const found = new Set<string>();
  for (let i = 0; i < queryIds.length; i += ID_CHUNK) {
    const rows = await db
      .select({ queryId: mentions.queryId })
      .from(mentions)
      .where(
        and(
          inArray(mentions.queryId, queryIds.slice(i, i + ID_CHUNK)),
          gte(mentions.createdAt, sql`now() - interval '24 hours'`),
          sql`${mentions.sentiment} is not null`,
        ),
      )
      .groupBy(mentions.queryId)
      .having(sql`count(*) >= ${minCount}`);
    for (const row of rows) found.add(row.queryId);
  }
  return found;
}

/** At least `minCount` mentions in the last 24 hours — the floor of the competitor and creator-spike evaluators (a creator's count can only be as high as the query's). */
export async function getQueryIdsWithRecentMentions(db: Db, queryIds: string[], minCount: number): Promise<Set<string>> {
  const found = new Set<string>();
  for (let i = 0; i < queryIds.length; i += ID_CHUNK) {
    const rows = await db
      .select({ queryId: mentions.queryId })
      .from(mentions)
      .where(and(inArray(mentions.queryId, queryIds.slice(i, i + ID_CHUNK)), gte(mentions.createdAt, sql`now() - interval '24 hours'`)))
      .groupBy(mentions.queryId)
      .having(sql`count(*) >= ${minCount}`);
    for (const row of rows) found.add(row.queryId);
  }
  return found;
}

/**
 * Queries on which some AI topic has at least `minCount` mentions in the last 24 hours — the emerging-topic evaluator's
 * floor, stated exactly (it needs one topic with `currentCount >= 3`). With AI enrichment off no topics exist, so no
 * rule is evaluated.
 */
export async function getQueryIdsWithTopicVolume(db: Db, queryIds: string[], minCount: number): Promise<Set<string>> {
  const found = new Set<string>();
  for (let i = 0; i < queryIds.length; i += ID_CHUNK) {
    const rows = await db
      .select({ queryId: mentions.queryId })
      .from(mentions)
      .innerJoin(mentionTopics, eq(mentionTopics.mentionId, mentions.id))
      .where(and(inArray(mentions.queryId, queryIds.slice(i, i + ID_CHUNK)), gte(mentions.createdAt, sql`now() - interval '24 hours'`)))
      .groupBy(mentions.queryId, mentionTopics.topicId)
      .having(sql`count(distinct ${mentions.id}) >= ${minCount}`);
    for (const row of rows) found.add(row.queryId);
  }
  return found;
}

/**
 * Queries with at least `minCount` mentions in the last 24 hours whose story has a known social author — the
 * creator-spike evaluator's floor, stated exactly (a creator's count is a subset of these).
 */
export async function getQueryIdsWithCreatorPosts(db: Db, queryIds: string[], minCount: number): Promise<Set<string>> {
  const found = new Set<string>();
  for (let i = 0; i < queryIds.length; i += ID_CHUNK) {
    const rows = await db
      .select({ queryId: mentions.queryId })
      .from(mentions)
      .innerJoin(articles, eq(articles.id, mentions.articleId))
      .where(
        and(
          inArray(mentions.queryId, queryIds.slice(i, i + ID_CHUNK)),
          gte(mentions.createdAt, sql`now() - interval '24 hours'`),
          sql`${articles.authorProfileId} is not null`,
        ),
      )
      .groupBy(mentions.queryId)
      .having(sql`count(*) >= ${minCount}`);
    for (const row of rows) found.add(row.queryId);
  }
  return found;
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
        and created_at >= now() - interval '8 days'
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

export type CompetitorAlertStats = {
  competitorQueryName: string;
  competitorCount: number;
  companyCount: number;
};

/**
 * docs/product/USER_FLOWS.md §4 "competitor" alert type — distinct from
 * a generic spike (which compares a query against its own history): this
 * compares a Phase 30 `trackingTarget: "competitor"` query's last-24h
 * mention volume against the combined volume of every active "company"
 * query in the same project, i.e. "is a competitor now getting more
 * attention than you?" rather than "did this query's own volume jump?".
 * Returns undefined if the query no longer exists (deleted mid-cycle).
 */
export async function getCompetitorAlertStats(
  db: Db,
  projectId: string,
  competitorQueryId: string,
): Promise<CompetitorAlertStats | undefined> {
  const [competitorQuery] = await db
    .select({ name: monitoringQueries.name })
    .from(monitoringQueries)
    .where(eq(monitoringQueries.id, competitorQueryId))
    .limit(1);
  if (!competitorQuery) return undefined;

  const since = sql`now() - interval '24 hours'`;

  const [[competitorRow], [companyRow]] = await Promise.all([
    db
      .select({ count: count(mentions.id) })
      .from(mentions)
      .where(and(eq(mentions.queryId, competitorQueryId), gte(mentions.createdAt, since))),
    db
      .select({ count: count(mentions.id) })
      .from(mentions)
      .innerJoin(monitoringQueries, eq(monitoringQueries.id, mentions.queryId))
      .where(
        and(
          eq(monitoringQueries.projectId, projectId),
          eq(monitoringQueries.trackingTarget, "company"),
          eq(monitoringQueries.status, "active"),
          isNull(monitoringQueries.deletedAt),
          gte(mentions.createdAt, since),
        ),
      ),
  ]);

  return {
    competitorQueryName: competitorQuery.name,
    competitorCount: Number(competitorRow?.count ?? 0),
    companyCount: Number(companyRow?.count ?? 0),
  };
}
