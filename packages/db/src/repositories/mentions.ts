import { and, count, desc, eq, gte, ilike, inArray, isNull, sql } from "drizzle-orm";
import type { Db } from "../client";
import { articles, mentions, sources, type Tag } from "../schema/content";
import { monitoringQueries } from "../schema/monitoring";
import { organizationMemberships } from "../schema/organizations";
import { users } from "../schema/users";
import type { OrganizationId } from "./tenant-scope";
import {
  listMentionEntities,
  listMentionTopics,
  type MentionEntityRow,
  type MentionTopicRow,
} from "./ai";
import { listTagsForMention } from "./tags";

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
  options: { projectId?: string; limit?: number } = {},
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
    filters.sinceDays
      ? gte(
          mentions.createdAt,
          sql`now() - (${filters.sinceDays}::text || ' days')::interval`,
        )
      : undefined,
    // Substring match on title — the MVP baseline ahead of the tsvector/
    // Meilisearch tiers in docs/architecture/SEARCH.md (ADR-002).
    filters.search ? ilike(articles.title, `%${filters.search}%`) : undefined,
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
  const where = mentionFiltersToWhere(organizationId, filters);
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
      .orderBy(desc(mentions.createdAt))
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

export type MentionDetail = MentionListItem & {
  queryName: string;
  aiEntities: MentionEntityRow[];
  aiTopics: MentionTopicRow[];
  tags: Tag[];
};

/**
 * For the Mention Detail Drawer's "Why did this match?" (brief §15) and
 * AI trust layer (summary/sentiment/entities/topics with confidence +
 * method, AI_ARCHITECTURE.md) — `mention.aiStatus` tells the UI whether to
 * render enrichment or "Not available".
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
    })
    .from(mentions)
    .innerJoin(articles, eq(articles.id, mentions.articleId))
    .innerJoin(sources, eq(sources.id, articles.sourceId))
    .innerJoin(monitoringQueries, eq(monitoringQueries.id, mentions.queryId))
    .leftJoin(users, eq(users.id, mentions.assignedToUserId))
    .where(and(eq(mentions.organizationId, organizationId), eq(mentions.id, mentionId)))
    .limit(1);
  if (!row) return undefined;

  const [aiEntities, aiTopics, tags] = await Promise.all([
    listMentionEntities(db, mentionId),
    listMentionTopics(db, mentionId),
    listTagsForMention(db, mentionId),
  ]);
  return { ...row, aiEntities, aiTopics, tags };
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
  options: { sinceDays?: number } = {},
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
      ),
    )
    .groupBy(monitoringQueries.id, monitoringQueries.name, monitoringQueries.trackingTarget)
    .orderBy(monitoringQueries.trackingTarget, monitoringQueries.name);

  return rows.map((row) => ({
    ...row,
    totalMentions: Number(row.totalMentions),
    positive: Number(row.positive),
    neutral: Number(row.neutral),
    negative: Number(row.negative),
  }));
}
