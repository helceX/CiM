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
