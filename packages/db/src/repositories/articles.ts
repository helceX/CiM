import { eq, or, sql } from "drizzle-orm";
import { turkishFold } from "@cim/core";
import type { Db } from "../client";
import { articles, sources } from "../schema/content";

/** Articles are global/reference data (ADR-001) — no tenant scoping here. */

export async function findExistingArticle(
  db: Db,
  input: { canonicalUrl: string; contentHash: string },
) {
  const [existing] = await db
    .select()
    .from(articles)
    .where(
      or(
        eq(articles.canonicalUrl, input.canonicalUrl),
        eq(articles.contentHash, input.contentHash),
      ),
    )
    .limit(1);
  return existing;
}

export async function insertArticle(
  db: Db,
  input: {
    sourceId: string;
    canonicalUrl: string;
    contentHash: string;
    title: string;
    storedExcerpt: string | null;
    language: string | null;
    publishedAt: Date | null;
    authorName: string | null;
    // docs/architecture/ADR-006-SOCIAL-LISTENING.md — set by the
    // pipeline when the raw fetch result carried a social author;
    // absent/null for every non-social article.
    authorProfileId?: string | null;
  },
) {
  // docs/architecture/ADR-002-SEARCH.md MVP tier — folded here (JS, not a
  // Postgres GENERATED column: turkishFold must run before to_tsvector
  // ever sees the text) so every new article is searchable immediately,
  // not just after a later backfill.
  const folded = turkishFold(`${input.title} ${input.storedExcerpt ?? ""}`);
  const [article] = await db
    .insert(articles)
    .values({ ...input, searchVector: sql`to_tsvector('simple', ${folded})` })
    .onConflictDoNothing()
    .returning();
  if (article) return article;

  // Race: findExistingArticle (the caller, pipeline.ts's ingestSource)
  // found nothing, but another concurrent crawl of the same source
  // (crawlSource runs at concurrency:5; a stalled-job requeue can also
  // dispatch the same source's job twice) inserted this exact
  // canonicalUrl/contentHash first — articles_content_hash_uidx/
  // articles_canonical_url_uidx caught it. Return that row rather than
  // throwing, so this stays the upsert pipeline.ts's own docstring
  // promises ("re-running over the same fetched item upserts the same
  // Article ... never creates a duplicate Mention").
  const existing = await findExistingArticle(db, {
    canonicalUrl: input.canonicalUrl,
    contentHash: input.contentHash,
  });
  if (!existing) throw new Error("Failed to insert article");
  return existing;
}

/**
 * docs/architecture/ADR-004-INGESTION.md's own promise — "title/semantic
 * similarity... producing StoryCluster rows" — implemented here as the
 * title-similarity slice, via the same pg_trgm extension/index
 * `articles_title_trgm_idx` already exists for. Deliberately excludes
 * `excludeSourceId`: the point of clustering is cross-source
 * corroboration ("who else is covering this"), not linking an outlet's
 * own two headlines about the same event. 0.5 is a stricter floor than
 * pg_trgm's own 0.3 default `%` threshold — clustering drives what a
 * user is shown as "related coverage" (master prompt §38: never framed
 * as a certain link), so a false-positive costs more here than in a
 * plain search match.
 */
export async function findSimilarRecentArticle(
  db: Db,
  input: { title: string; excludeSourceId: string; sinceHours?: number },
): Promise<{ id: string; storyClusterId: string | null } | undefined> {
  const sinceHours = input.sinceHours ?? 48;
  const rows = await db.execute<{ id: string; story_cluster_id: string | null }>(sql`
    select id, story_cluster_id
    from articles
    where source_id != ${input.excludeSourceId}
      and fetched_at >= now() - (${sinceHours}::text || ' hours')::interval
      and similarity(title, ${input.title}) > 0.5
    order by similarity(title, ${input.title}) desc
    limit 1
  `);
  const row = rows.rows[0];
  return row ? { id: row.id, storyClusterId: row.story_cluster_id } : undefined;
}

export async function setArticleStoryCluster(
  db: Db,
  articleId: string,
  storyClusterId: string,
): Promise<void> {
  await db.update(articles).set({ storyClusterId }).where(eq(articles.id, articleId));
}

/**
 * docs/architecture/DATA_MODEL.md — "Related coverage" for the Mention
 * Detail Drawer: every other article sharing this article's
 * storyClusterId, most recent first. Empty when the article isn't
 * clustered with anything yet (a single-source story stays uncertain
 * until a second source corroborates it — findSimilarRecentArticle only
 * assigns a cluster once that happens).
 */
export type RelatedArticle = {
  id: string;
  title: string;
  canonicalUrl: string;
  publishedAt: Date | null;
  fetchedAt: Date;
  sourceName: string;
  sourceType: string;
};

export async function listRelatedArticles(
  db: Db,
  storyClusterId: string,
  excludeArticleId: string,
): Promise<RelatedArticle[]> {
  return db
    .select({
      id: articles.id,
      title: articles.title,
      canonicalUrl: articles.canonicalUrl,
      publishedAt: articles.publishedAt,
      fetchedAt: articles.fetchedAt,
      sourceName: sources.name,
      sourceType: sources.type,
    })
    .from(articles)
    .innerJoin(sources, eq(sources.id, articles.sourceId))
    .where(
      sql`${articles.storyClusterId} = ${storyClusterId} and ${articles.id} != ${excludeArticleId}`,
    )
    .orderBy(sql`coalesce(${articles.publishedAt}, ${articles.fetchedAt}) desc`)
    .limit(10);
}

/**
 * docs/architecture/SEARCH.md "Preview results" — a read-only sample of
 * recent articles, evaluated in-process against a candidate QueryAst
 * before it's saved. Capped and time-bounded on purpose: this is a
 * quick-feedback preview, not the eventual search index (Meilisearch,
 * ADR-002) that a saved query will actually run against at scale.
 */
export async function listRecentArticlesForPreview(db: Db, days = 30, limit = 500) {
  // WebConnector always sets publishedAt: null (no reliable publish date
  // on a scraped page), and ApiConnector does too whenever the upstream
  // item omits one — a plain `gte(publishedAt, ...)` treats those as
  // unknown/false and excludes them from every preview permanently,
  // regardless of the days window, even though the real ingestion
  // pipeline (pipeline.ts) doesn't filter on publishedAt at all and
  // would happily turn the same article into a real Mention. Falling
  // back to createdAt (ingestion time, never null) keeps "recent" from
  // silently meaning "recent AND from a source that reports dates."
  const recency = sql`coalesce(${articles.publishedAt}, ${articles.createdAt})`;
  return db
    .select({
      id: articles.id,
      title: articles.title,
      publishedAt: articles.publishedAt,
      sourceName: sources.name,
      sourceType: sources.type,
    })
    .from(articles)
    .innerJoin(sources, eq(sources.id, articles.sourceId))
    .where(sql`${recency} >= now() - (${days}::text || ' days')::interval`)
    .orderBy(sql`${recency} desc`)
    .limit(limit);
}
