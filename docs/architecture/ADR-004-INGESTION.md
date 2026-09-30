# ADR-004: Ingestion & Connector Architecture

## Status
Accepted

## Context
The product must ingest news/web/social/etc. content from a growing,
heterogeneous set of sources over time (brief §29–33, Phase 1 → Phase 3)
without each new source type requiring changes to the pipeline, dedup,
search, or UI layers. Content rights (§31) and anti-SSRF/anti-abuse
requirements (§76–77) must be structural, not per-connector afterthoughts.

## Decision
1. **`SourceConnector` interface**, one contract for every source type
   (Mock, RSS, Sitemap, Web, API, Social, YouTube, Podcast, Broadcast,
   Custom — see `INGESTION.md`). Every connector returns the same
   `RawFetchResult` shape; everything downstream (normalize → dedupe →
   index → AI → alert) is connector-agnostic.
2. **`MockNewsConnector` ships in MVP** as a first-class connector (not a
   test-only stub) so the full product UX is demonstrable and E2E-testable
   without live crawling, per §123.
3. **`SourcePolicy` is enforced in code at two points**: ingestion
   (what gets stored) and render (what gets displayed) — independently,
   so tightening a policy after ingestion still protects already-stored
   content. This is a hard requirement, not a nice-to-have (§31, §127,
   `SECURITY.md`).
4. **SSRF protection is a pipeline-level concern**, implemented once in
   the fetch layer all connectors share, not reimplemented per connector:
   resolved-IP validation against private/loopback/metadata ranges,
   redirect re-validation, timeouts, response size caps (`SECURITY.md`).
5. **Jobs, not inline requests.** Every fetch/parse/enrich step runs as a
   queued worker job (BullMQ) with per-job status/retry/backoff tracking,
   never inside a web request-response cycle (§34, §128).
6. **No access-control bypass, ever.** Connectors never attempt to defeat
   paywalls, logins, or robots.txt-declared restrictions. A source that
   can't be legitimately accessed is marked `unavailable`, never faked.
7. **Deduplication/story clustering is a pipeline stage**, not a UI-layer
   filter — canonical URL → content hash → title/semantic similarity →
   source-relationship heuristics, producing `StoryCluster` rows that
   both the Mentions UI and the alert engine's grouping logic consume
   (avoids the "30 emails for one story" failure mode, §20).

## Alternatives considered
- **Per-source-type bespoke pipelines.** Rejected — would duplicate
  dedup/policy/SSRF logic per connector and make adding new source types
  in Phase 3 (Social, YouTube, Broadcast) a pipeline rewrite instead of a
  new connector implementation.
- **Third-party all-in-one scraping SaaS as the sole ingestion path.**
  Rejected as the *only* path — acceptable as one possible `APIConnector`
  backend later, but the architecture must not depend on one vendor for
  its core data acquisition capability (matches brief's "don't just copy
  a scraper repo" guidance, §30).

## Consequences
- New source types are additive (implement the interface), which is the
  point — but the interface itself must stay stable; changing
  `RawFetchResult`'s shape is a breaking change across every connector
  and the pipeline's normalize stage, so it's reviewed carefully.
- Mock and real connectors must be kept behaviorally equivalent enough
  that E2E tests against the mock catch real pipeline regressions.
