import { eq, inArray, sql } from "drizzle-orm";
import { turkishFold } from "@cim/core";
import type { SearchDocument, SearchIndex, SearchQuery, SearchResult, TenantScope } from "@cim/search";
import type { Db } from "../client";
import { articles, mentions } from "../schema/content";

/**
 * docs/architecture/ADR-002-SEARCH.md MVP tier: Postgres is both the store
 * and the search backend, so there's no separate index to keep in sync.
 * Two signals, combined transparently (SEARCH.md "Relevance ranking"):
 * - `search_vector` (tsvector, Turkish-folded + tokenized at write time —
 *   insertArticle in ./repositories/articles.ts) for exact/phrase
 *   full-text matching.
 * - `pg_trgm` + `unaccent` similarity on the raw title for typo tolerance
 *   (SEARCH.md explicitly calls for unaccent/trigram here, not the JS
 *   turkishFold — that's a DB-native pass a SQL expression can run
 *   directly, no per-row JS needed).
 *
 * Lives in packages/db (not packages/search, which only holds the
 * backend-agnostic SearchIndex interface) because it needs Db/schema
 * directly and packages/search must not depend on packages/db — a later
 * Meilisearch-backed SearchIndex would similarly live wherever it needs
 * its own backend's client, never in packages/search itself.
 */
export class PostgresSearchIndex implements SearchIndex {
  constructor(private readonly db: Db) {}

  /** Backfill/maintenance path — insertArticle populates search_vector inline on write. */
  async index(docs: SearchDocument[]): Promise<void> {
    await Promise.all(
      docs.map((doc) => {
        const folded = turkishFold(`${doc.title} ${doc.body ?? ""}`);
        return this.db
          .update(articles)
          .set({ searchVector: sql`to_tsvector('simple', ${folded})` })
          .where(eq(articles.id, doc.id));
      }),
    );
  }

  async remove(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.db.update(articles).set({ searchVector: null }).where(inArray(articles.id, ids));
  }

  /**
   * Scoped via the mentions join (ADR-001) — Articles are global/reference
   * data, so tenant isolation has to be enforced here, not on the table.
   */
  async search(query: SearchQuery, scope: TenantScope): Promise<SearchResult> {
    const folded = turkishFold(query.text);
    if (!folded.trim()) return { items: [] };
    const limit = query.limit ?? 50;

    const rank = sql`ts_rank(${articles.searchVector}, plainto_tsquery('simple', ${folded}))`;
    // word_similarity, not similarity — the query is one or two words and
    // the title is a full sentence, so a whole-string similarity() score
    // is diluted by length mismatch and never crosses a useful threshold.
    // word_similarity finds the best-matching word-boundary extent inside
    // the title instead, which is what "typo in one word of the title"
    // typo-tolerance actually needs (SEARCH.md's unaccent/pg_trgm tier).
    const similarity = sql`word_similarity(unaccent(lower(${query.text})), unaccent(lower(${articles.title})))`;

    const rows = await this.db
      .select({
        articleId: articles.id,
        rank: sql<number>`${rank}`,
        similarity: sql<number>`${similarity}`,
      })
      .from(articles)
      .where(
        sql`exists (
          select 1 from ${mentions}
          where ${mentions.articleId} = ${articles.id}
            and ${mentions.organizationId} = ${scope.organizationId}
        )
        and (
          ${articles.searchVector} @@ plainto_tsquery('simple', ${folded})
          or ${similarity} > 0.3
        )`,
      )
      .orderBy(sql`greatest(${rank}, ${similarity}) desc`)
      .limit(limit);

    return {
      items: rows.map((row) => ({
        articleId: row.articleId,
        score: Math.max(Number(row.rank), Number(row.similarity)),
      })),
    };
  }
}
