import { and, count, desc, eq, gte, ilike, sql } from "drizzle-orm";
import type { Db } from "../client";
import { articles, mentions, sources } from "../schema/content";
import { monitoringQueries } from "../schema/monitoring";
import type { OrganizationId } from "./tenant-scope";

export type MentionListItem = {
  mention: typeof mentions.$inferSelect;
  article: typeof articles.$inferSelect;
  source: typeof sources.$inferSelect;
};

export async function listRecentMentions(
  db: Db,
  organizationId: OrganizationId,
  options: { projectId?: string; limit?: number } = {},
): Promise<MentionListItem[]> {
  const limit = options.limit ?? 20;
  return db
    .select({ mention: mentions, article: articles, source: sources })
    .from(mentions)
    .innerJoin(articles, eq(articles.id, mentions.articleId))
    .innerJoin(sources, eq(sources.id, articles.sourceId))
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
};

export type MentionsPage = {
  items: MentionListItem[];
  totalCount: number;
  page: number;
  pageSize: number;
};

function mentionFiltersToWhere(organizationId: OrganizationId, filters: MentionFilters) {
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
      ? gte(mentions.createdAt, sql`now() - (${filters.sinceDays}::text || ' days')::interval`)
      : undefined,
    // Substring match on title — the MVP baseline ahead of the tsvector/
    // Meilisearch tiers in docs/architecture/SEARCH.md (ADR-002).
    filters.search ? ilike(articles.title, `%${filters.search}%`) : undefined,
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
      .select({ mention: mentions, article: articles, source: sources })
      .from(mentions)
      .innerJoin(articles, eq(articles.id, mentions.articleId))
      .innerJoin(sources, eq(sources.id, articles.sourceId))
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
};

/** For the Mention Detail Drawer's "Why did this match?" (brief §15). */
export async function getMentionDetail(
  db: Db,
  organizationId: OrganizationId,
  mentionId: string,
): Promise<MentionDetail | undefined> {
  const [row] = await db
    .select({ mention: mentions, article: articles, source: sources, queryName: monitoringQueries.name })
    .from(mentions)
    .innerJoin(articles, eq(articles.id, mentions.articleId))
    .innerJoin(sources, eq(sources.id, articles.sourceId))
    .innerJoin(monitoringQueries, eq(monitoringQueries.id, mentions.queryId))
    .where(and(eq(mentions.organizationId, organizationId), eq(mentions.id, mentionId)))
    .limit(1);
  return row;
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
