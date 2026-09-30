import { and, eq, or, sql } from "drizzle-orm";
import type { Db } from "../client";
import { articles, mentions, sources } from "../schema/content";
import { entities, entityAliases, mentionEntities, mentionTopics, topics } from "../schema/ai";
import { asOrganizationId, type OrganizationId } from "./tenant-scope";

export type EnrichmentCandidate = {
  mentionId: string;
  organizationId: OrganizationId;
  articleId: string;
  title: string;
  excerpt: string | null;
  sourceCanProcessAi: boolean;
};

/**
 * docs/architecture/AI_ARCHITECTURE.md — the worker's ai_enrich job scans
 * for pending work across every tenant, the same documented cross-tenant
 * read exception as `listActiveMonitoringQueriesForSourceType` and
 * `getActiveSpikeAlertRules` (ADR-001): enrichment is a system process
 * over shared/global Article content, not a per-tenant query. Only the
 * article's title and its SourcePolicy-governed stored excerpt are read —
 * never full text the policy didn't allow storing.
 */
export async function listPendingEnrichmentMentions(
  db: Db,
  limit = 25,
): Promise<EnrichmentCandidate[]> {
  const rows = await db
    .select({
      mentionId: mentions.id,
      organizationId: mentions.organizationId,
      articleId: mentions.articleId,
      title: articles.title,
      excerpt: articles.storedExcerpt,
      sourceCanProcessAi: sources.canProcessAi,
    })
    .from(mentions)
    .innerJoin(articles, eq(articles.id, mentions.articleId))
    .innerJoin(sources, eq(sources.id, articles.sourceId))
    .where(eq(mentions.aiStatus, "pending"))
    .orderBy(mentions.createdAt)
    .limit(limit);
  return rows.map((row) => ({ ...row, organizationId: asOrganizationId(row.organizationId) }));
}

export type CachedEnrichment = {
  mentionId: string;
  sentiment: "positive" | "neutral" | "negative" | null;
  sentimentConfidence: string | null;
  aiSummary: string | null;
  aiMethod: string | null;
};

/**
 * docs/architecture/AI_ARCHITECTURE.md cost control — "responses are
 * cached by content_hash so identical content is never re-analyzed".
 * Article rows are already deduped by content_hash/canonical URL
 * (findExistingArticle), so any other Mention sharing this articleId is,
 * by construction, the same content — reuse its completed result instead
 * of calling the provider again.
 */
export async function findCompletedEnrichmentForArticle(
  db: Db,
  articleId: string,
): Promise<CachedEnrichment | undefined> {
  const [row] = await db
    .select({
      mentionId: mentions.id,
      sentiment: mentions.sentiment,
      sentimentConfidence: mentions.sentimentConfidence,
      aiSummary: mentions.aiSummary,
      aiMethod: mentions.aiMethod,
    })
    .from(mentions)
    .where(and(eq(mentions.articleId, articleId), eq(mentions.aiStatus, "completed")))
    .limit(1);
  return row as CachedEnrichment | undefined;
}

export async function copyMentionEnrichmentAssignments(
  db: Db,
  fromMentionId: string,
  toMentionId: string,
): Promise<void> {
  const [entityRows, topicRows] = await Promise.all([
    db
      .select({ entityId: mentionEntities.entityId, salience: mentionEntities.salience })
      .from(mentionEntities)
      .where(eq(mentionEntities.mentionId, fromMentionId)),
    db
      .select({ topicId: mentionTopics.topicId, confidence: mentionTopics.confidence })
      .from(mentionTopics)
      .where(eq(mentionTopics.mentionId, fromMentionId)),
  ]);

  if (entityRows.length > 0) {
    await db
      .insert(mentionEntities)
      .values(entityRows.map((r) => ({ mentionId: toMentionId, ...r })))
      .onConflictDoNothing();
  }
  if (topicRows.length > 0) {
    await db
      .insert(mentionTopics)
      .values(topicRows.map((r) => ({ mentionId: toMentionId, ...r })))
      .onConflictDoNothing();
  }
}

export async function markMentionEnrichmentSkipped(db: Db, mentionId: string): Promise<void> {
  await db
    .update(mentions)
    .set({ aiStatus: "skipped", aiAnalyzedAt: new Date() })
    .where(eq(mentions.id, mentionId));
}

export async function markMentionEnrichmentFailed(db: Db, mentionId: string): Promise<void> {
  await db
    .update(mentions)
    .set({ aiStatus: "failed", aiAnalyzedAt: new Date() })
    .where(eq(mentions.id, mentionId));
}

export async function markMentionEnrichmentCompleted(
  db: Db,
  mentionId: string,
  input: {
    sentiment: "positive" | "neutral" | "negative";
    sentimentConfidence: number;
    aiSummary: string;
    aiMethod: string;
  },
): Promise<void> {
  await db
    .update(mentions)
    .set({
      aiStatus: "completed",
      sentiment: input.sentiment,
      sentimentConfidence: String(input.sentimentConfidence),
      aiSummary: input.aiSummary,
      aiMethod: input.aiMethod,
      aiAnalyzedAt: new Date(),
    })
    .where(eq(mentions.id, mentionId));
}

/**
 * Resolves a name to a canonical Entity, matching either the entity's own
 * name or a known alias (brief §13/§102), case-insensitively — creating a
 * new Entity only when neither matches. Best-effort dedup: no DB-level
 * uniqueness on `entities.name` (case variants aren't merged), acceptable
 * for MVP volume.
 */
export async function findOrCreateEntity(db: Db, name: string, type: string): Promise<string> {
  const [existing] = await db
    .select({ id: entities.id })
    .from(entities)
    .leftJoin(entityAliases, eq(entityAliases.entityId, entities.id))
    .where(
      or(
        sql`lower(${entities.name}) = lower(${name})`,
        sql`lower(${entityAliases.alias}) = lower(${name})`,
      ),
    )
    .limit(1);
  if (existing) return existing.id;

  const [created] = await db.insert(entities).values({ name, type }).returning({ id: entities.id });
  if (!created) throw new Error("failed to create entity");
  return created.id;
}

export async function findOrCreateTopic(db: Db, name: string): Promise<string> {
  const [existing] = await db
    .select({ id: topics.id })
    .from(topics)
    .where(sql`lower(${topics.name}) = lower(${name})`)
    .limit(1);
  if (existing) return existing.id;

  const [created] = await db
    .insert(topics)
    .values({ name })
    .onConflictDoNothing({ target: topics.name })
    .returning({ id: topics.id });
  if (created) return created.id;

  // Lost a create race against another enrichment job between the SELECT
  // and the INSERT above — the unique index caught it, so read it back.
  const [fallback] = await db
    .select({ id: topics.id })
    .from(topics)
    .where(sql`lower(${topics.name}) = lower(${name})`)
    .limit(1);
  if (!fallback) throw new Error("failed to find or create topic");
  return fallback.id;
}

export async function addMentionEntity(
  db: Db,
  mentionId: string,
  entityId: string,
  salience: number,
): Promise<void> {
  await db
    .insert(mentionEntities)
    .values({ mentionId, entityId, salience: String(salience) })
    .onConflictDoNothing();
}

export async function addMentionTopic(
  db: Db,
  mentionId: string,
  topicId: string,
  confidence: number,
): Promise<void> {
  await db
    .insert(mentionTopics)
    .values({ mentionId, topicId, confidence: String(confidence) })
    .onConflictDoNothing();
}

export type MentionEntityRow = { name: string; type: string; salience: string };
export type MentionTopicRow = { name: string; confidence: string };

export async function listMentionEntities(db: Db, mentionId: string): Promise<MentionEntityRow[]> {
  return db
    .select({ name: entities.name, type: entities.type, salience: mentionEntities.salience })
    .from(mentionEntities)
    .innerJoin(entities, eq(entities.id, mentionEntities.entityId))
    .where(eq(mentionEntities.mentionId, mentionId))
    .orderBy(sql`${mentionEntities.salience} desc`);
}

export async function listMentionTopics(db: Db, mentionId: string): Promise<MentionTopicRow[]> {
  return db
    .select({ name: topics.name, confidence: mentionTopics.confidence })
    .from(mentionTopics)
    .innerJoin(topics, eq(topics.id, mentionTopics.topicId))
    .where(eq(mentionTopics.mentionId, mentionId))
    .orderBy(sql`${mentionTopics.confidence} desc`);
}
