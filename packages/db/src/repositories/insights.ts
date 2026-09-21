import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import type { Db } from "../client";
import { articles, mentions, sources } from "../schema/content";
import { insightEvidence, insights } from "../schema/ai";
import { monitoringQueries } from "../schema/monitoring";
import { organizations, projects } from "../schema/organizations";
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
    .orderBy(desc(mentions.priority), desc(mentions.createdAt))
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
 * to be selected.
 */
export async function getLatestInsightForOrganization(
  db: Db,
  organizationId: OrganizationId,
  kind: string,
): Promise<InsightWithEvidenceAndProject | undefined> {
  const [row] = await db
    .select({ insight: insights, projectName: projects.name })
    .from(insights)
    .innerJoin(projects, eq(projects.id, insights.projectId))
    .where(and(eq(insights.organizationId, organizationId), eq(insights.kind, kind)))
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
