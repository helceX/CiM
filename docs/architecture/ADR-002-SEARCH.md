# ADR-002: Search Engine Strategy

## Status
Accepted

## Context
The product needs: transactional, relationally-filterable storage (source
of truth); fast full-text search with Turkish-language typo tolerance and
faceting; and semantic/vector search for natural-language queries. No
single engine covers all three well, and introducing a dedicated search
cluster on day one is operationally heavier than an MVP-stage team needs.

## Decision
Layer search capability over time behind one interface
(`packages/search`), rather than committing to one engine everywhere:

1. **PostgreSQL is the system of record**, always. Every document any
   search layer returns must be reconstructable from Postgres alone — no
   search backend is allowed to become an undocumented source of truth.
2. **MVP**: Postgres full-text search (`tsvector` + `pg_trgm` for typo
   tolerance) covers Mentions/Articles search and filtering. This avoids
   standing up Meilisearch/OpenSearch before real query-volume/latency
   data justifies it.
3. **Phase 2 trigger**: introduce Meilisearch (preferred over OpenSearch
   for this workload — simpler operations, strong typo-tolerance and
   faceting defaults, good fit for a single-language-family-at-a-time
   corpus) once search-as-you-type latency or faceting complexity
   outgrows Postgres FTS. Indexing is a one-way projection from Postgres;
   the index is always rebuildable from scratch.
4. **pgvector** for embeddings/semantic search, inside the existing
   Postgres instance rather than a separate vector database — keeps
   operational surface minimal while corpus size is at MVP scale, and
   keeps vector data co-located with the relational data it enriches.
5. **`SearchIndex` interface** (`index`, `remove`, `search`) is the only
   thing call sites depend on, so Postgres-only → Postgres+Meilisearch is
   a backend swap behind the interface, not a rewrite of every caller.

## Alternatives considered
- **OpenSearch from day one.** More operationally heavy (JVM, cluster
  management) than Meilisearch for the faceting/typo-tolerance needs
  described, and than Postgres FTS is for MVP scale. Not ruled out
  permanently — OpenSearch remains the fallback if aggregation/analytics
  query needs outgrow Meilisearch later (brief explicitly allows either).
- **Dedicated vector DB (e.g. a managed vector service).** Unjustified
  operational addition versus pgvector at current/foreseeable corpus size.
- **Elasticsearch.** Licensing/operational profile similar to OpenSearch
  without a clear advantage for this workload; OpenSearch is the more
  clearly open alternative if that tier is ever needed.

## Consequences
- Search relevance work happens twice conceptually (Postgres FTS ranking,
  then Meilisearch ranking later) — mitigated by keeping ranking-signal
  logic (`SEARCH.md` §Relevance ranking) in `packages/core/query`, not
  duplicated per backend.
- Turkish-language correctness (case folding, normalization) must be
  handled at the application layer consistently regardless of backend,
  since Postgres FTS's built-in Turkish support is limited — see
  `SEARCH.md`.
