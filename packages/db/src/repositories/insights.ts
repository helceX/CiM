import { and, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import type { Db } from "../client";
import { articles, mentions, sources } from "../schema/content";
import { insightEvidence, insights } from "../schema/ai";
import { monitoringQueries } from "../schema/monitoring";
import { organizations, projects } from "../schema/organizations";
import { insightPriorityRank, mentionPriorityRank } from "./priority-rank";
import { asOrganizationId, type OrganizationId } from "./tenant-scope";

export type ActiveProjectRef = { organizationId: OrganizationId; projectId: string };

/**
 * docs/architecture/AI_ARCHITECTURE.md — the scheduled insight_generate
 * job needs every project with active monitoring (the same documented
 * cross-tenant read exception as `listActiveMonitoringQueriesForSourceType`,
 * ADR-001), not one project passed in by a caller.
 */
export async function listActiveProjectsForInsightGeneration(db: Db): Promise<ActiveProjectRef[]> {
  const rows = await db
    .selectDistinct({
      organizationId: monitoringQueries.organizationId,
      projectId: monitoringQueries.projectId,
    })
    .from(monitoringQueries)
    .innerJoin(organizations, eq(organizations.id, monitoringQueries.organizationId))
    .where(
      and(
        eq(monitoringQueries.status, "active"),
        isNull(monitoringQueries.deletedAt),
        isNull(organizations.deletedAt),
      ),
    );
  return rows.map((row) => ({ ...row, organizationId: asOrganizationId(row.organizationId) }));
}

/**
 * Structurally matches `@cim/ai`'s `InsightSourceMention` without
 * depending on that package from `@cim/db` — the worker (which depends on
 * both) passes this straight to `AIProvider.generateInsight`.
 */
export type InsightMentionRow = {
  id: string;
  title: string;
  sourceName: string;
  sentiment: "positive" | "neutral" | "negative" | null;
  priority: string;
  publishedAt: string | null;
};

/**
 * Feeds `AIProvider.generateInsight` (docs/architecture/AI_ARCHITECTURE.md
 * cost control — expensive synthesis is reserved for what will actually
 * surface, capped here rather than handing the model unbounded input).
 */
export async function listMentionsForInsightPeriod(
  db: Db,
  organizationId: OrganizationId,
  projectId: string,
  sinceHours: number,
  limit = 30,
): Promise<InsightMentionRow[]> {
  const rows = await db
    .select({
      id: mentions.id,
      title: articles.title,
      sourceName: sources.name,
      sentiment: mentions.sentiment,
      priority: mentions.priority,
      publishedAt: articles.publishedAt,
    })
    .from(mentions)
    .innerJoin(articles, eq(articles.id, mentions.articleId))
    .innerJoin(sources, eq(sources.id, articles.sourceId))
    .where(
      and(
        eq(mentions.organizationId, organizationId),
        eq(mentions.projectId, projectId),
        gte(mentions.createdAt, sql`now() - (${sinceHours}::text || ' hours')::interval`),
      ),
    )
    // Plain `desc(mentions.priority)` sorts alphabetically ("normal"
    // before "critical", the same trap digest.ts's "top stories" query
    // hit first) — rank explicitly so the LIMIT below caps to the
    // highest-severity mentions, not the highest in the alphabet.
    .orderBy(desc(mentionPriorityRank()), desc(mentions.createdAt))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    sourceName: row.sourceName,
    sentiment: (row.sentiment as InsightMentionRow["sentiment"]) ?? null,
    priority: row.priority,
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
  }));
}

/**
 * Grounding for the AI Assistant (docs/architecture/AI_ARCHITECTURE.md
 * "Grounded, contextual assistant") — the org's most recent mentions,
 * capped the same way `listMentionsForInsightPeriod` caps synthesis input
 * (AI_ARCHITECTURE.md §Cost control), just without a time window: a
 * question can reasonably be about anything still recent enough to matter,
 * not only the last 24h.
 */
export async function listRecentMentionsForAssistant(
  db: Db,
  organizationId: OrganizationId,
  options: { projectId?: string; limit?: number } = {},
): Promise<InsightMentionRow[]> {
  const limit = options.limit ?? 30;
  const rows = await db
    .select({
      id: mentions.id,
      title: articles.title,
      sourceName: sources.name,
      sentiment: mentions.sentiment,
      priority: mentions.priority,
      publishedAt: articles.publishedAt,
    })
    .from(mentions)
    .innerJoin(articles, eq(articles.id, mentions.articleId))
    .innerJoin(sources, eq(sources.id, articles.sourceId))
    .where(
      and(
        eq(mentions.organizationId, organizationId),
        options.projectId ? eq(mentions.projectId, options.projectId) : undefined,
        // Same "already triaged, don't resurface it" exclusion
        // mentionFiltersToWhere applies by default — a mention the user
        // marked irrelevant/duplicate must never come back as evidence in
        // an assistant answer, contradicting the feedback they just gave.
        sql`${mentions.status} != 'archived'`,
      ),
    )
    .orderBy(desc(mentions.createdAt))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    sourceName: row.sourceName,
    sentiment: (row.sentiment as InsightMentionRow["sentiment"]) ?? null,
    priority: row.priority,
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
  }));
}

export async function createInsight(
  db: Db,
  organizationId: OrganizationId,
  input: {
    projectId: string;
    kind: string;
    summary: string;
    confidence: number;
    method: string;
    periodStart: Date;
    periodEnd: Date;
    evidenceMentionIds: string[];
    why?: string;
    priority?: string;
  },
): Promise<string> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(insights)
      .values({
        organizationId,
        projectId: input.projectId,
        kind: input.kind,
        summary: input.summary,
        confidence: String(input.confidence),
        method: input.method,
        why: input.why,
        priority: input.priority,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
      })
      .returning({ id: insights.id });
    if (!row) throw new Error("failed to create insight");

    // AI_ARCHITECTURE.md Trust Layer — mandatory, not optional: an Insight
    // with zero evidence rows cannot be rendered as a factual claim.
    await tx.insert(insightEvidence).values(
      input.evidenceMentionIds.map((mentionId) => ({ insightId: row.id, mentionId })),
    );

    return row.id;
  });
}

export type InsightEvidenceItem = {
  mentionId: string;
  title: string;
  sourceName: string;
};

export type InsightWithEvidence = {
  id: string;
  kind: string;
  summary: string;
  confidence: string;
  method: string;
  why: string | null;
  priority: string | null;
  periodStart: Date;
  periodEnd: Date;
  createdAt: Date;
  evidence: InsightEvidenceItem[];
};

export async function getLatestInsight(
  db: Db,
  organizationId: OrganizationId,
  projectId: string,
  kind: string,
): Promise<InsightWithEvidence | undefined> {
  const [insight] = await db
    .select()
    .from(insights)
    .where(
      and(
        eq(insights.organizationId, organizationId),
        eq(insights.projectId, projectId),
        eq(insights.kind, kind),
      ),
    )
    .orderBy(desc(insights.createdAt))
    .limit(1);
  if (!insight) return undefined;

  const evidence = await db
    .select({ mentionId: mentions.id, title: articles.title, sourceName: sources.name })
    .from(insightEvidence)
    .innerJoin(mentions, eq(mentions.id, insightEvidence.mentionId))
    .innerJoin(articles, eq(articles.id, mentions.articleId))
    .innerJoin(sources, eq(sources.id, articles.sourceId))
    .where(eq(insightEvidence.insightId, insight.id));

  return { ...insight, evidence };
}

export type InsightWithEvidenceAndProject = InsightWithEvidence & { projectName: string };

/**
 * The dashboard (docs/product/PRODUCT_VISION.md "since yesterday"
 * executive brief) aggregates across every project, so it shows the most
 * recently generated insight org-wide rather than requiring one project
 * to be selected. A report's "AI Insight" section (FEATURE_MATRIX.md P2
 * report builder) is scoped to one project, so it passes `projectId` to
 * avoid surfacing a different project's insight in this project's report.
 */
export async function getLatestInsightForOrganization(
  db: Db,
  organizationId: OrganizationId,
  kind: string,
  options: { projectId?: string } = {},
): Promise<InsightWithEvidenceAndProject | undefined> {
  const [row] = await db
    .select({ insight: insights, projectName: projects.name })
    .from(insights)
    .innerJoin(projects, eq(projects.id, insights.projectId))
    .where(
      and(
        eq(insights.organizationId, organizationId),
        eq(insights.kind, kind),
        options.projectId ? eq(insights.projectId, options.projectId) : undefined,
      ),
    )
    .orderBy(desc(insights.createdAt))
    .limit(1);
  if (!row) return undefined;

  const evidence = await db
    .select({ mentionId: mentions.id, title: articles.title, sourceName: sources.name })
    .from(insightEvidence)
    .innerJoin(mentions, eq(mentions.id, insightEvidence.mentionId))
    .innerJoin(articles, eq(articles.id, mentions.articleId))
    .innerJoin(sources, eq(sources.id, articles.sourceId))
    .where(eq(insightEvidence.insightId, row.insight.id));

  return { ...row.insight, projectName: row.projectName, evidence };
}

/**
 * A single `generateRecommendations` call can return several items
 * (RecommendationItem[]), each stored as its own `kind: "recommendation"`
 * insights row (createInsight) sharing one `periodEnd` — so "the latest
 * batch" is every row matching that most recent periodEnd, not just the
 * single newest row `getLatestInsight` would return. `projectId` is
 * optional, same convention as `getLatestInsightForOrganization`: the
 * Dashboard shows the org's latest batch across every project, a report
 * passes `projectId` to stay scoped to the one it's for.
 */
export async function listLatestRecommendationsForOrganization(
  db: Db,
  organizationId: OrganizationId,
  options: { projectId?: string } = {},
): Promise<InsightWithEvidence[]> {
  const scope = and(
    eq(insights.organizationId, organizationId),
    eq(insights.kind, "recommendation"),
    options.projectId ? eq(insights.projectId, options.projectId) : undefined,
  );

  const [latest] = await db
    .select({ periodEnd: insights.periodEnd })
    .from(insights)
    .where(scope)
    .orderBy(desc(insights.periodEnd))
    .limit(1);
  if (!latest) return [];

  const rows = await db
    .select()
    .from(insights)
    .where(and(scope, eq(insights.periodEnd, latest.periodEnd)))
    // Same alphabetical-sort trap as mentions.priority — rank explicitly
    // so "high" recommendations/risks actually outrank "medium"/"low".
    .orderBy(desc(insightPriorityRank()), desc(insights.confidence));
  if (rows.length === 0) return [];

  const evidence = await db
    .select({
      insightId: insightEvidence.insightId,
      mentionId: mentions.id,
      title: articles.title,
      sourceName: sources.name,
    })
    .from(insightEvidence)
    .innerJoin(mentions, eq(mentions.id, insightEvidence.mentionId))
    .innerJoin(articles, eq(articles.id, mentions.articleId))
    .innerJoin(sources, eq(sources.id, articles.sourceId))
    .where(inArray(insightEvidence.insightId, rows.map((r) => r.id)));

  return rows.map((row) => ({
    ...row,
    evidence: evidence
      .filter((e) => e.insightId === row.id)
      .map((e) => ({ mentionId: e.mentionId, title: e.title, sourceName: e.sourceName })),
  }));
}
