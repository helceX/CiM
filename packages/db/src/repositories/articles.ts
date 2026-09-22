import { desc, eq, gte, or, sql } from "drizzle-orm";
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
    .returning();
  if (!article) throw new Error("Failed to insert article");
  return article;
}

/**
 * docs/architecture/SEARCH.md "Preview results" — a read-only sample of
 * recent articles, evaluated in-process against a candidate QueryAst
 * before it's saved. Capped and time-bounded on purpose: this is a
 * quick-feedback preview, not the eventual search index (Meilisearch,
 * ADR-002) that a saved query will actually run against at scale.
 */
export async function listRecentArticlesForPreview(db: Db, days = 30, limit = 500) {
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
    .where(gte(articles.publishedAt, sql`now() - (${days}::text || ' days')::interval`))
    .orderBy(desc(articles.publishedAt))
    .limit(limit);
}
