# Search Architecture

## Layered approach (ADR-002)

- **PostgreSQL** — system of record. Relational filtering, transactional
  integrity, and (MVP) full-text search via `tsvector`/`pg_trgm` for
  Turkish + English. Every result the app shows can be reconstructed from
  Postgres alone.
- **Meilisearch (or OpenSearch)** — introduced when full-text UX needs
  (typo tolerance, faceting at scale, sub-100ms search-as-you-type) exceed
  what Postgres FTS comfortably gives. Populated from Postgres via an
  indexing job, never a second source of truth — it can be dropped and
  rebuilt at any time (ARCHITECTURE.md fault isolation).
- **pgvector** — semantic/vector search (embeddings) lives inside Postgres
  as an extension rather than a separate vector DB, keeping operational
  surface area small while the corpus is at MVP scale.

A `packages/search` interface (`SearchIndex`) abstracts over the active
backend so swapping Postgres-FTS-only for Meilisearch-backed search later
is a backend swap, not a call-site rewrite:

```ts
interface SearchIndex {
  index(docs: SearchDocument[]): Promise<void>;
  remove(ids: string[]): Promise<void>;
  search(query: SearchQuery, scope: TenantScope): Promise<SearchResult>;
}
```

## Query parsing (brief §12, §39)

A dedicated `packages/core/query` module owns:
- Parsing Simple-mode chip state and Advanced-mode Boolean syntax
  (`AND`/`OR`/`NOT`/exact phrase/wildcards, `NEAR` as a stretch operator)
  into one canonical `QueryAST`.
- Rendering a `QueryAST` back to Boolean string form, so switching editor
  modes is lossless in both directions.
- Evaluating a `QueryAST` against a normalized `Article` for pipeline
  matching, and translating it to the active search backend's query
  syntax for interactive search.

This is intentionally decoupled from any specific search engine so the
same parser output drives ingestion-time matching, Postgres queries, and
Meilisearch/OpenSearch filters identically.

## Turkish-language handling (brief §13)

- Unicode normalization (NFC) on ingestion and query input.
- Turkish-aware case folding: dotted `İ`/`i` vs dotless `I`/`ı` handled via
  explicit locale-aware folding, not naive `toLowerCase()` (which
  corrupts Turkish casing in JS/ICU default locale).
- `unaccent`/trigram (`pg_trgm`) for typo tolerance in Postgres; the
  Meilisearch/OpenSearch tier gets equivalent typo-tolerance config when
  introduced.
- Entity alias table (brief §102) links surface forms ("İTO", "İstanbul
  Ticaret Odası", "Istanbul Chamber of Commerce") to one Entity — alias
  expansion is **opt-in per query** (a toggle, defaulted off for Boolean
  power users) so it never silently changes a user's literal query intent
  (brief §13's explicit constraint).

## Semantic search (brief §39)

Natural-language queries ("şirketin sürdürülebilirlik yatırımları") run
through the embedding pipeline (pgvector) and are combined with lexical
results using a blended ranking, never as a silent replacement for literal
Boolean queries. Results always disclose *why* they matched (lexical
field/phrase match vs. semantic similarity) — see `AI_ARCHITECTURE.md`
Trust Layer, which the "Why did this match?" UI panel (brief §15) reuses.

## Relevance ranking (brief §99)

Signals, combined transparently (never a black-box score with no
explanation available): exact match, phrase match, matched-field weight
(title > body), term frequency, recency, semantic similarity (when
semantic mode is active), source weight/tier. The Media Impact Score
(brief §27) is a separate, explicitly-labeled composite score — it is not
mixed into search ranking.

## Query preview / quality assistant (brief §100–101)

"Preview results" executes the current `QueryAST` against the last 30 days
read-only before saving, showing match count and include/exclude sample
hits. A lightweight heuristic (ambiguity flags for single common-word
queries, e.g. a bare brand name that collides with a dictionary word) can
suggest disambiguation; this is a rule-based/AI-assisted *suggestion*
layer on top of the parser, never a modification of the saved query
without explicit user action.
