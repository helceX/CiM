/**
 * docs/architecture/ADR-002-SEARCH.md / SEARCH.md — the only abstraction
 * call sites should depend on, so swapping the Postgres-FTS-only MVP tier
 * for a Meilisearch-backed one later ("Phase 2 trigger", gated on real
 * query-volume/latency data) is a backend swap behind this interface, not
 * a call-site rewrite.
 */

/** A unit of indexable content — currently always one Article. */
export type SearchDocument = {
  id: string;
  title: string;
  body: string | null;
};

export type SearchQuery = {
  text: string;
  limit?: number;
};

/** ADR-001 — search results are always scoped to one tenant. */
export type TenantScope = {
  organizationId: string;
};

export type SearchResultItem = {
  articleId: string;
  score: number;
};

export type SearchResult = {
  items: SearchResultItem[];
};

export interface SearchIndex {
  index(docs: SearchDocument[]): Promise<void>;
  remove(ids: string[]): Promise<void>;
  search(query: SearchQuery, scope: TenantScope): Promise<SearchResult>;
}
