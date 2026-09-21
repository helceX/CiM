import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import type { Db } from "../client";
import { articles, mentions, sources } from "../schema/content";
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
): Promise<boolean> {
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
