import { and, count, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { companyNames, keywordMatches, prepareText } from "@cim/core";
import type { Db } from "../client";
import { articles, mentions, sources, type Tag } from "../schema/content";
import { monitoringQueries, type QueryAst } from "../schema/monitoring";
import { organizationMemberships } from "../schema/organizations";
import { socialProfiles } from "../schema/social";
import { users } from "../schema/users";
import { PostgresSearchIndex } from "../search/postgres-search-index";
import type { OrganizationId } from "./tenant-scope";
import {
  listMentionEntities,
  listMentionTopics,
  type MentionEntityRow,
  type MentionTopicRow,
} from "./ai";
import { listTagsForMention } from "./tags";
import {
  listCommentsForMention,
  type MentionCommentWithAuthor,
} from "./mention-comments";
import { listRelatedArticles, type RelatedArticle } from "./articles";

export type BrandMention = MentionListItem & {
  /** Which of the company's names the story carries (full name or short name). */
  matchedName: string;
  /** Where in the story: its headline, or its lead. */
  where: "headline" | "lead";
};

/**
 * Stories that NAME the company directly — the full name or the short name of a monitoring's company — in
 * their headline or lead, newest first. Not "stories some keyword matched": a story only counts when the company
 * itself is written there. Returns the names it looked for, so the Dashboard can say what "your brand" means.
 */
export async function listBrandMentions(
  db: Db,
  organizationId: OrganizationId,
  options: { limit?: number; sinceDays?: number } = {},
): Promise<{ names: string[]; items: BrandMention[] }> {
  const limit = options.limit ?? 8;
  const queries = await db
    .select({ id: monitoringQueries.id, queryAst: monitoringQueries.queryAst })
    .from(monitoringQueries)
    .where(
      and(
        eq(monitoringQueries.organizationId, organizationId),
        isNull(monitoringQueries.deletedAt),
        eq(monitoringQueries.status, "active"),
        sql`${monitoringQueries.queryAst} -> 'company' is not null`,
      ),
    );
  const names = [...new Set(queries.flatMap((query) => companyNames(query.queryAst)))];
  if (names.length === 0) return { names, items: [] };

  const rows = await db
    .select({ mention: mentions, article: articles, source: sources, assigneeName: assigneeNameColumn })
    .from(mentions)
    .innerJoin(articles, eq(articles.id, mentions.articleId))
    .innerJoin(sources, eq(sources.id, articles.sourceId))
    .leftJoin(users, eq(users.id, mentions.assignedToUserId))
    .where(
      and(
        eq(mentions.organizationId, organizationId),
        inArray(mentions.queryId, queries.map((query) => query.id)),
        sql`${mentions.status} != 'archived'`,
        gte(sql`coalesce(${articles.publishedAt}, ${mentions.createdAt})`, new Date(Date.now() - (options.sinceDays ?? 30) * 86_400_000)),
      ),
    )
    .orderBy(desc(sql`coalesce(${articles.publishedAt}, ${mentions.createdAt})`), desc(mentions.id))
    .limit(400);

  const seen = new Set<string>();
  const items: BrandMention[] = [];
  for (const row of rows) {
    if (seen.has(row.article.id)) continue; // one story, however many monitorings found it
    const headline = prepareText(row.article.title);
    const lead = prepareText(row.article.storedExcerpt ?? "");
    const options2 = { language: row.article.language };
    const inHeadline = names.find((name) => keywordMatches(name, headline, options2));
    const inLead = inHeadline ? undefined : names.find((name) => keywordMatches(name, lead, options2));
    const matchedName = inHeadline ?? inLead;
    if (!matchedName) continue;
    seen.add(row.article.id);
    items.push({ ...row, matchedName, where: inHeadline ? "headline" : "lead" });
    if (items.length >= limit) break;
  }
  return { names, items };
}

export type MentionListItem = {
  mention: typeof mentions.$inferSelect;
  article: typeof articles.$inferSelect;
  source: typeof sources.$inferSelect;
  assigneeName: string | null;
};

/**
 * The `case when` guards against a left join's own null-propagation
 * surprise: `firstName || ' ' || lastName` on a genuinely unassigned row
 * is null either way, but being explicit means this reads the same
 * whether or not the join columns happen to be non-null for other
 * reasons later.
 */
const assigneeNameColumn = sql<
  string | null
>`case when ${mentions.assignedToUserId} is null
  then null else ${users.firstName} || ' ' || ${users.lastName} end`;

export async function listRecentMentions(
  db: Db,
  organizationId: OrganizationId,
  options: { projectId?: string; limit?: number; sinceDays?: number } = {},
): Promise<MentionListItem[]> {
  const limit = options.limit ?? 20;
  return db
    .select({
      mention: mentions,
      article: articles,
      source: sources,
      assigneeName: assigneeNameColumn,
    })
    .from(mentions)
    .innerJoin(articles, eq(articles.id, mentions.articleId))
    .innerJoin(sources, eq(sources.id, articles.sourceId))
    .leftJoin(users, eq(users.id, mentions.assignedToUserId))
    .where(
      and(
        eq(mentions.organizationId, organizationId),
        options.projectId ? eq(mentions.projectId, options.projectId) : undefined,
        // Optional — the Dashboard's "recent activity" feed (Phase 4) wants
        // no bound at all, but a report's "Top Stories" section (gather-data.ts)
        // has an explicit periodStart/periodEnd on the page and must not show
        // stories from outside it, so it passes this to stay consistent with
        // the period the report itself claims to cover.
        options.sinceDays !== undefined
          ? gte(
              mentions.createdAt,
              sql`now() - (${options.sinceDays}::text || ' days')::interval`,
            )
          : undefined,
      ),
    )
    .orderBy(desc(mentions.createdAt))
    .limit(limit);
}

/**
 * Idempotent by design (docs/architecture/INGESTION.md): re-running the
 * pipeline over the same Article must not create a second Mention for the
 * same query — enforced by the DB unique index, not just this check.
 */
export async function createMentionIfNotExists(
  db: Db,
  organizationId: OrganizationId,
  input: {
    projectId: string;
    queryId: string;
    articleId: string;
    matchedTerms: string[];
    priority?: "low" | "normal" | "high" | "critical";
    // docs/architecture/ADR-006-SOCIAL-LISTENING.md — the typed match
    // taxonomy behind the "Why matched?" UI. Omitted (not just null) by
    // every caller that predates this classification, so those mentions
    // keep rendering "Not classified" rather than a guessed value.
    matchType?: string | null;
    matchConfidence?: string | null;
    matchedRule?: string | null;
    // Set only when a story is matched after the fact (monitoring backfill):
    // the mention is stamped with the story's own date, not "now", so a
    // freshly-saved monitoring does not look like a sudden burst to the alert
    // checks that count mentions per time window.
    createdAt?: Date;
  },
): Promise<string | null> {
  const result = await db
    .insert(mentions)
    .values({
      organizationId,
      projectId: input.projectId,
      queryId: input.queryId,
      articleId: input.articleId,
      matchedTerms: input.matchedTerms,
      priority: input.priority ?? "normal",
      matchType: input.matchType ?? null,
      matchConfidence: input.matchConfidence ?? null,
      matchedRule: input.matchedRule ?? null,
      ...(input.createdAt ? { createdAt: input.createdAt } : {}),
    })
    .onConflictDoNothing({ target: [mentions.queryId, mentions.articleId] })
    .returning({ id: mentions.id });
  return result[0]?.id ?? null;
}

export type MentionFilters = {
  projectId?: string;
  sentiment?: "positive" | "neutral" | "negative" | "unclassified";
  priority?: "low" | "normal" | "high" | "critical";
  search?: string;
  sinceDays?: number;
  includeArchived?: boolean;
  // Resolved server-side (e.g. "assigned to me" -> the caller's own
  // userId) — never a raw value read straight off the request, same
  // discipline as organizationId itself (ADR-001).
  assignedToUserId?: string;
  unassignedOnly?: boolean;
  tagId?: string;
  // Mentions of any query currently in this brand group.
  brandGroupId?: string;
  // Mentions produced by one monitoring query ("View mentions" on the
  // Monitoring list). Org scope still comes from organizationId, so a
  // foreign query id simply matches nothing.
  queryId?: string;
};

export type MentionsPage = {
  items: MentionListItem[];
  totalCount: number;
  page: number;
  pageSize: number;
};

function mentionFiltersToWhere(
  organizationId: OrganizationId,
  filters: MentionFilters,
  // Resolved by listMentionsFiltered via PostgresSearchIndex before this
  // runs — undefined means "no search filter", [] means "search ran and
  // matched nothing" (must exclude everything, never fall through to no
  // filter at all).
  searchArticleIds?: string[],
) {
  return and(
    eq(mentions.organizationId, organizationId),
    // Mentions marked irrelevant/duplicate (setMentionFeedback -> status
    // "archived") are noise the reviewer already dismissed — excluded by
    // default, same as any inbox hides what you've already triaged.
    filters.includeArchived ? undefined : sql`${mentions.status} != 'archived'`,
    filters.projectId ? eq(mentions.projectId, filters.projectId) : undefined,
    filters.priority ? eq(mentions.priority, filters.priority) : undefined,
    filters.sentiment === "unclassified"
      ? sql`${mentions.sentiment} is null`
      : filters.sentiment
        ? eq(mentions.sentiment, filters.sentiment)
        : undefined,
    // Number.isFinite, not just != null — sinceDays reaches here straight
    // from a URL query param (apps/web mentions/analytics/dashboard pages
    // all do `Number(param)` with no validation of the result), so a
    // non-numeric value like ?since=abc produces NaN, which is `!= null`
    // and would otherwise interpolate as `('NaN days')::interval` — a
    // string Postgres rejects, crashing the whole page instead of just
    // ignoring the bad filter.
    filters.sinceDays != null && Number.isFinite(filters.sinceDays)
      ? gte(
          mentions.createdAt,
          sql`now() - (${filters.sinceDays}::text || ' days')::interval`,
        )
      : undefined,
    // docs/architecture/ADR-002-SEARCH.md MVP tier — tsvector + pg_trgm via
    // PostgresSearchIndex, resolved by the caller before this runs.
    filters.search ? inArray(articles.id, searchArticleIds ?? []) : undefined,
    filters.assignedToUserId
      ? eq(mentions.assignedToUserId, filters.assignedToUserId)
      : undefined,
    filters.unassignedOnly ? isNull(mentions.assignedToUserId) : undefined,
    // A subquery, not a join, so filtering by tag never turns one Mention
    // into duplicate rows for a second matching tag — this only asks
    // "does at least one mention_tags row for (this mention, this tag)
    // exist", same shape as the entity/topic exists-checks in ai.ts.
    filters.tagId
      ? sql`exists (select 1 from mention_tags mt where mt.mention_id = ${mentions.id} and mt.tag_id = ${filters.tagId})`
      : undefined,
    filters.queryId ? eq(mentions.queryId, filters.queryId) : undefined,
    filters.brandGroupId
      ? sql`${mentions.queryId} in (select mq.id from monitoring_queries mq where mq.brand_group_id = ${filters.brandGroupId} and mq.organization_id = ${organizationId})`
      : undefined,
  );
}

/**
 * The Mentions table (brief §14/§51) — the product's primary working
 * screen. Filtered and paginated in the database, never by fetching
 * everything and slicing client-side (brief §90).
 */
export async function listMentionsFiltered(
  db: Db,
  organizationId: OrganizationId,
  filters: MentionFilters,
  pagination: { page: number; pageSize: number },
): Promise<MentionsPage> {
  let searchArticleIds: string[] | undefined;
  if (filters.search) {
    // No limit — this repository needs the true match set to paginate
    // and count correctly (see PostgresSearchIndex.search's own note); a
    // capped preview would silently under-report totalCount and make
    // results beyond the cap unreachable.
    const searchIndex = new PostgresSearchIndex(db);
    const result = await searchIndex.search(
      { text: filters.search },
      { organizationId },
    );
    searchArticleIds = result.items.map((item) => item.articleId);
  }

  const where = mentionFiltersToWhere(organizationId, filters, searchArticleIds);
  const offset = (pagination.page - 1) * pagination.pageSize;

  const [items, [countRow]] = await Promise.all([
    db
      .select({
        mention: mentions,
        article: articles,
        source: sources,
        assigneeName: assigneeNameColumn,
      })
      .from(mentions)
      .innerJoin(articles, eq(articles.id, mentions.articleId))
      .innerJoin(sources, eq(sources.id, articles.sourceId))
      .leftJoin(users, eq(users.id, mentions.assignedToUserId))
      .where(where)
      // A secondary tiebreaker on id: two mentions can share the same
      // created_at (e.g. a bulk/transactional ingest), and without one
      // Postgres doesn't guarantee the tied rows stay in the same order
      // across the page-1 and page-2 queries — a mention could appear on
      // both pages, or be skipped entirely, purely from ordering drift.
      .orderBy(desc(mentions.createdAt), desc(mentions.id))
      .limit(pagination.pageSize)
      .offset(offset),
    db
      .select({ total: count() })
      .from(mentions)
      .innerJoin(articles, eq(articles.id, mentions.articleId))
      .where(where),
  ]);

  return {
    items,
    totalCount: Number(countRow?.total ?? 0),
    page: pagination.page,
    pageSize: pagination.pageSize,
  };
}

/**
 * The day a story belongs to. Bucketed in Türkiye time (not UTC) so a story
 * published at 01:00 local lands on the day readers expect; the publication
 * date wins, and the time we found it is the fallback for sources that carry none.
 */
export const MENTION_DAY_TIMEZONE = "Europe/Istanbul";
const mentionDay = sql<string>`to_char((coalesce(${articles.publishedAt}, ${mentions.createdAt}) at time zone ${sql.raw(`'${MENTION_DAY_TIMEZONE}'`)})::date, 'YYYY-MM-DD')`;

export type MentionDaySummary = {
  /** YYYY-MM-DD */
  day: string;
  total: number;
  /** Mentions per `Source.type`, for the badges on a collapsed day. */
  byType: Record<string, number>;
};

async function resolveSearchIds(db: Db, organizationId: OrganizationId, filters: MentionFilters) {
  if (!filters.search) return undefined;
  const searchIndex = new PostgresSearchIndex(db);
  const result = await searchIndex.search({ text: filters.search }, { organizationId });
  return result.items.map((item) => item.articleId);
}

/**
 * One row per day that has mentions (newest first), with how many came from
 * each kind of source — what the collapsed day buttons show. Paged by day, so
 * years of history stay cheap: opening a day loads only that day.
 */
export async function listMentionDays(
  db: Db,
  organizationId: OrganizationId,
  filters: MentionFilters,
  pagination: { page: number; pageSize: number },
): Promise<{ days: MentionDaySummary[]; totalDays: number }> {
  const where = mentionFiltersToWhere(organizationId, filters, await resolveSearchIds(db, organizationId, filters));
  const offset = (pagination.page - 1) * pagination.pageSize;

  const dayRows = await db
    .select({ day: mentionDay, total: count() })
    .from(mentions)
    .innerJoin(articles, eq(articles.id, mentions.articleId))
    .where(where)
    .groupBy(mentionDay)
    .orderBy(desc(mentionDay))
    .limit(pagination.pageSize)
    .offset(offset);

  const [{ totalDays } = { totalDays: 0 }] = await db
    .select({ totalDays: sql<number>`count(distinct ${mentionDay})::int` })
    .from(mentions)
    .innerJoin(articles, eq(articles.id, mentions.articleId))
    .where(where);

  if (dayRows.length === 0) return { days: [], totalDays: Number(totalDays) };

  const days = dayRows.map((row) => row.day);
  const typeRows = await db
    .select({ day: mentionDay, type: sources.type, total: count() })
    .from(mentions)
    .innerJoin(articles, eq(articles.id, mentions.articleId))
    .innerJoin(sources, eq(sources.id, articles.sourceId))
    .where(and(where, inArray(mentionDay, days)))
    .groupBy(mentionDay, sources.type);

  return {
    totalDays: Number(totalDays),
    days: dayRows.map((row) => ({
      day: row.day,
      total: Number(row.total),
      byType: Object.fromEntries(typeRows.filter((t) => t.day === row.day).map((t) => [t.type, Number(t.total)])),
    })),
  };
}

export type MentionDayItem = MentionListItem & {
  /** The monitoring the story matched — a story matched by two monitorings appears under both. */
  queryName: string;
  queryCreatedAt: Date;
  /** The monitoring's keyword structure, for grouping a day's stories by concept. */
  queryAst: QueryAst;
  /** The group a person filed the monitoring under, if any. */
  queryBrandGroupId: string | null;
};

/** How many stories of one monitoring a day shows before it says "the newest N of M". */
export const DAY_STORIES_PER_MONITORING = 150;

export type MentionDay = {
  items: MentionDayItem[];
  /** True when at least one monitoring has more stories this day than were returned. */
  truncated: boolean;
  /** Every story of the day per monitoring (not only the returned ones), keyed by query id. */
  totals: Record<string, number>;
};

/**
 * The mentions of one day, newest first — loaded when the day is opened.
 *
 * The cap applies to each monitoring on its own, not to the day as a whole: a broad monitoring that
 * matches hundreds of stories a day must not push a narrow one off the page, so with two or more
 * monitorings running every one of them keeps its newest `limit` stories.
 */
export async function listMentionsForDay(
  db: Db,
  organizationId: OrganizationId,
  filters: MentionFilters,
  day: string,
  limit = DAY_STORIES_PER_MONITORING,
): Promise<MentionDay> {
  const where = and(
    mentionFiltersToWhere(organizationId, filters, await resolveSearchIds(db, organizationId, filters)),
    sql`${mentionDay} = ${day}`,
  );
  const totalRows = await db
    .select({ queryId: mentions.queryId, total: count() })
    .from(mentions)
    .innerJoin(articles, eq(articles.id, mentions.articleId))
    .where(where)
    .groupBy(mentions.queryId);
  const totals = Object.fromEntries(totalRows.map((row) => [row.queryId, Number(row.total)]));

  const perQuery = await Promise.all(
    totalRows.map((row) =>
      db
        .select({
          mention: mentions,
          article: articles,
          source: sources,
          assigneeName: assigneeNameColumn,
          queryName: monitoringQueries.name,
          queryCreatedAt: monitoringQueries.createdAt,
          queryAst: monitoringQueries.queryAst,
          queryBrandGroupId: monitoringQueries.brandGroupId,
        })
        .from(mentions)
        .innerJoin(articles, eq(articles.id, mentions.articleId))
        .innerJoin(sources, eq(sources.id, articles.sourceId))
        .innerJoin(monitoringQueries, eq(monitoringQueries.id, mentions.queryId))
        .leftJoin(users, eq(users.id, mentions.assignedToUserId))
        .where(and(where, eq(mentions.queryId, row.queryId)))
        .orderBy(desc(sql`coalesce(${articles.publishedAt}, ${mentions.createdAt})`), desc(mentions.id))
        .limit(limit),
    ),
  );

  const when = (item: MentionDayItem) => (item.article.publishedAt ?? item.mention.createdAt).getTime();
  const items = perQuery.flat().sort((a, b) => when(b) - when(a) || b.mention.id.localeCompare(a.mention.id));
  return { items, truncated: Object.values(totals).some((total) => total > limit), totals };
}

export type MentionSocialAuthor = {
  platform: string;
  handle: string;
  displayName: string | null;
  profileUrl: string | null;
  followers: number | null;
  verified: boolean | null;
};

export type MentionDetail = MentionListItem & {
  queryName: string;
  aiEntities: MentionEntityRow[];
  aiTopics: MentionTopicRow[];
  tags: Tag[];
  comments: MentionCommentWithAuthor[];
  // docs/architecture/ADR-006-SOCIAL-LISTENING.md — populated only when
  // the article's source is social and a social_profiles row was linked
  // at ingestion time; null for every non-social mention, never a
  // fabricated placeholder (brief §35, §182–184).
  socialAuthor: MentionSocialAuthor | null;
  // docs/architecture/ADR-004-INGESTION.md — other articles sharing this
  // one's storyClusterId (packages/ingestion's title-similarity
  // clustering), most recent first. Empty for an uncorroborated,
  // single-source story — never a certain "this caused that" claim
  // (master prompt §38), just what else looks related.
  relatedArticles: RelatedArticle[];
};

/**
 * For the Mention Detail Drawer's "Why did this match?" (brief §15) and
 * AI trust layer (summary/sentiment/entities/topics with confidence +
 * method, AI_ARCHITECTURE.md) — `mention.aiStatus` tells the UI whether to
 * render enrichment or "Not available". `mention.matchType`/
 * `matchConfidence`/`matchedRule` (ADR-006) drive the "Why matched?"
 * section; the socialProfiles left join (`socialAuthor`) backs the
 * author card for social-sourced mentions.
 */
export async function getMentionDetail(
  db: Db,
  organizationId: OrganizationId,
  mentionId: string,
): Promise<MentionDetail | undefined> {
  const [row] = await db
    .select({
      mention: mentions,
      article: articles,
      source: sources,
      queryName: monitoringQueries.name,
      assigneeName: assigneeNameColumn,
      socialPlatform: socialProfiles.platform,
      socialHandle: socialProfiles.handle,
      socialDisplayName: socialProfiles.displayName,
      socialProfileUrl: socialProfiles.profileUrl,
      socialFollowers: socialProfiles.followers,
      socialVerified: socialProfiles.verified,
    })
    .from(mentions)
    .innerJoin(articles, eq(articles.id, mentions.articleId))
    .innerJoin(sources, eq(sources.id, articles.sourceId))
    .innerJoin(monitoringQueries, eq(monitoringQueries.id, mentions.queryId))
    .leftJoin(users, eq(users.id, mentions.assignedToUserId))
    .leftJoin(socialProfiles, eq(socialProfiles.id, articles.authorProfileId))
    .where(and(eq(mentions.organizationId, organizationId), eq(mentions.id, mentionId)))
    .limit(1);
  if (!row) return undefined;

  const [aiEntities, aiTopics, tags, comments, relatedArticles] = await Promise.all([
    listMentionEntities(db, mentionId),
    listMentionTopics(db, mentionId),
    listTagsForMention(db, mentionId),
    listCommentsForMention(db, mentionId),
    row.article.storyClusterId
      ? listRelatedArticles(db, row.article.storyClusterId, row.article.id)
      : Promise.resolve([]),
  ]);
  const {
    socialPlatform,
    socialHandle,
    socialDisplayName,
    socialProfileUrl,
    socialFollowers,
    socialVerified,
    ...rest
  } = row;
  const socialAuthor: MentionSocialAuthor | null =
    socialPlatform && socialHandle
      ? {
          platform: socialPlatform,
          handle: socialHandle,
          displayName: socialDisplayName,
          profileUrl: socialProfileUrl,
          followers: socialFollowers,
          verified: socialVerified,
        }
      : null;
  return {
    ...rest,
    aiEntities,
    aiTopics,
    tags,
    comments,
    socialAuthor,
    relatedArticles,
  };
}

export type AssignMentionResult = "ok" | "not_found" | "invalid_assignee";

/**
 * docs/product/FEATURE_MATRIX.md P2 "Collaboration (assign/comment/tag)"
 * — `mentions.assignedToUserId` has existed since Phase 1's schema but was
 * never wired to a mutation until now; this is the "assign" slice of that
 * row (comment/tag are their own, separately-scoped features).
 * `assignedToUserId: null` unassigns. A non-null value must name an
 * *active* member of this organization — checked here, not just left to
 * the caller's UI, the same defense-in-depth every tenant-scoped mutation
 * in this codebase applies (ADR-001): a crafted request naming an
 * arbitrary user id (a former member, or one from an entirely different
 * organization) is rejected rather than silently stored.
 */
export async function assignMention(
  db: Db,
  organizationId: OrganizationId,
  mentionId: string,
  assignedToUserId: string | null,
): Promise<AssignMentionResult> {
  if (assignedToUserId) {
    const [membership] = await db
      .select({ id: organizationMemberships.id })
      .from(organizationMemberships)
      .where(
        and(
          eq(organizationMemberships.organizationId, organizationId),
          eq(organizationMemberships.userId, assignedToUserId),
          eq(organizationMemberships.status, "active"),
        ),
      )
      .limit(1);
    if (!membership) return "invalid_assignee";
  }

  const result = await db
    .update(mentions)
    .set({ assignedToUserId })
    .where(and(eq(mentions.organizationId, organizationId), eq(mentions.id, mentionId)))
    .returning({ id: mentions.id });
  return result.length > 0 ? "ok" : "not_found";
}

export type MentionFeedback = "relevant" | "irrelevant" | "duplicate";

/**
 * brief §139 — this feedback is stored for future query-quality tuning,
 * not silently discarded; irrelevant/duplicate also move the mention out
 * of the "new" working set (status: archived) so it stops cluttering the
 * table it was reviewed from.
 */
export async function setMentionFeedback(
  db: Db,
  organizationId: OrganizationId,
  mentionId: string,
  feedback: MentionFeedback,
): Promise<boolean> {
  const result = await db
    .update(mentions)
    .set({
      reviewFeedback: feedback,
      status: feedback === "relevant" ? "reviewed" : "archived",
    })
    .where(and(eq(mentions.organizationId, organizationId), eq(mentions.id, mentionId)))
    .returning({ id: mentions.id });
  return result.length > 0;
}

export type DashboardSummary = {
  totalMentions: number;
  uniqueSources: number;
  positive: number;
  neutral: number;
  negative: number;
  unclassified: number;
  highPriority: number;
};

/** Aggregated in the database, never scanned/computed client-side
 * (docs/architecture/DATA_MODEL.md §Metrics, brief §90). */
export async function getDashboardSummary(
  db: Db,
  organizationId: OrganizationId,
  options: { projectId?: string; sinceDays?: number } = {},
): Promise<DashboardSummary> {
  const sinceDays = options.sinceDays ?? 7;
  const where = and(
    eq(mentions.organizationId, organizationId),
    options.projectId ? eq(mentions.projectId, options.projectId) : undefined,
    gte(mentions.createdAt, sql`now() - (${sinceDays}::text || ' days')::interval`),
  );

  const [row] = await db
    .select({
      totalMentions: count(),
      uniqueSources: sql<number>`count(distinct ${articles.sourceId})`,
      positive: sql<number>`count(*) filter (where ${mentions.sentiment} = 'positive')`,
      neutral: sql<number>`count(*) filter (where ${mentions.sentiment} = 'neutral')`,
      negative: sql<number>`count(*) filter (where ${mentions.sentiment} = 'negative')`,
      unclassified: sql<number>`count(*) filter (where ${mentions.sentiment} is null)`,
      highPriority: sql<number>`count(*) filter (where ${mentions.priority} in ('high', 'critical'))`,
    })
    .from(mentions)
    .innerJoin(articles, eq(articles.id, mentions.articleId))
    .where(where);

  return {
    totalMentions: Number(row?.totalMentions ?? 0),
    uniqueSources: Number(row?.uniqueSources ?? 0),
    positive: Number(row?.positive ?? 0),
    neutral: Number(row?.neutral ?? 0),
    negative: Number(row?.negative ?? 0),
    unclassified: Number(row?.unclassified ?? 0),
    highPriority: Number(row?.highPriority ?? 0),
  };
}

export type CompetitorComparisonRow = {
  queryId: string;
  queryName: string;
  trackingTarget: string;
  totalMentions: number;
  positive: number;
  neutral: number;
  negative: number;
};

/**
 * SCREEN_INVENTORY.md's Dashboard "Competitor Comparison (when competitors
 * configured)" section — groups active queries tagged "company"/"competitor"
 * (monitoring.ts `trackingTarget`) rather than a separate Competitor entity.
 */
export async function getCompetitorComparison(
  db: Db,
  organizationId: OrganizationId,
  options: { sinceDays?: number; projectId?: string } = {},
): Promise<CompetitorComparisonRow[]> {
  const sinceDays = options.sinceDays ?? 7;
  const rows = await db
    .select({
      queryId: monitoringQueries.id,
      queryName: monitoringQueries.name,
      trackingTarget: monitoringQueries.trackingTarget,
      totalMentions: count(mentions.id),
      positive: sql<number>`count(*) filter (where ${mentions.sentiment} = 'positive')`,
      neutral: sql<number>`count(*) filter (where ${mentions.sentiment} = 'neutral')`,
      negative: sql<number>`count(*) filter (where ${mentions.sentiment} = 'negative')`,
    })
    .from(monitoringQueries)
    .leftJoin(
      mentions,
      and(
        eq(mentions.queryId, monitoringQueries.id),
        gte(mentions.createdAt, sql`now() - (${sinceDays}::text || ' days')::interval`),
      ),
    )
    .where(
      and(
        eq(monitoringQueries.organizationId, organizationId),
        eq(monitoringQueries.status, "active"),
        isNull(monitoringQueries.deletedAt),
        inArray(monitoringQueries.trackingTarget, ["company", "competitor"]),
        options.projectId
          ? eq(monitoringQueries.projectId, options.projectId)
          : undefined,
      ),
    )
    .groupBy(
      monitoringQueries.id,
      monitoringQueries.name,
      monitoringQueries.trackingTarget,
    )
    .orderBy(monitoringQueries.trackingTarget, monitoringQueries.name);

  return rows.map((row) => ({
    ...row,
    totalMentions: Number(row.totalMentions),
    positive: Number(row.positive),
    neutral: Number(row.neutral),
    negative: Number(row.negative),
  }));
}
