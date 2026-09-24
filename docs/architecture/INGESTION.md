# Ingestion Architecture

## Connector abstraction (ADR-004, brief §29)

```
SourceConnector (interface)
├── MockNewsConnector      (dev/demo/E2E — no network access)
├── RSSConnector
├── SitemapConnector
├── WebConnector           (direct fetch + HTML parse; Playwright only
│                            when static fetch is insufficient)
├── APIConnector           (official third-party APIs, Phase 2+)
├── SocialConnector        (Phase 3, official APIs only)
├── YouTubeConnector       (Phase 3)
├── PodcastConnector       (Phase 3)
├── BroadcastConnector     (Phase 3, TV/Radio via licensed provider)
└── CustomConnector        (per-tenant, Phase 3+)
```

Every connector implements one contract and returns the same normalized
shape (`RawFetchResult`) regardless of source type:

```ts
interface SourceConnector {
  fetch(source: Source, cursor?: string): Promise<RawFetchResult[]>;
  healthCheck(source: Source): Promise<SourceHealth>;
}
```

`MockNewsConnector` exists specifically so the entire product UX — search,
dashboard, alerts, reports — is testable and demo-able without live
crawling (brief §123), and so E2E tests exercise the real pipeline
end-to-end.

## Pipeline stages (brief §33)

```
Discover → Fetch → Validate → Parse → Normalize → Canonicalize
  → Deduplicate → Language Detect → Entity Extract → Query Match
  → Classify → Embed → Index → Aggregate → Alert → AI Insight → Report
```

Each stage is a pure(ish) function or a queued job with a single
responsibility, re-runnable idempotently (re-processing the same Article
must not create duplicates or duplicate side effects — enforced via
`content_hash`/`canonical_url` upserts).

- **Discover** — scheduler enqueues `crawl_source` per active Source on
  its configured polling interval (per-source, not one global cron).
- **Fetch** — connector-specific; SSRF-guarded (see SECURITY.md), respects
  robots.txt/terms for Web/Sitemap connectors, never bypasses
  paywall/auth.
- **Validate/Parse/Normalize/Canonicalize** — produce the canonical
  `Article` shape; `SourcePolicy` is checked here — if
  `can_store_full_text` is false, only headline/excerpt/metadata are
  persisted, full text is discarded after processing.
- **Deduplicate** — canonical URL, content hash, then title/semantic
  similarity within a time window, then source-relationship heuristics
  (e.g. wire-service syndication) to assign/create a `StoryCluster`.
- **Language Detect / Entity Extract / Query Match** — Query Match runs
  each active `MonitoringQuery.QueryAST` (per tenant) against the
  normalized Article to produce `Mention` rows — this is where tenant
  fan-out happens; the Article itself is stored once.
- **Classify / Embed** — cost-tiered AI enrichment (see AI_ARCHITECTURE.md
  cost control) — cheap classifiers first, expensive synthesis only for
  what will actually surface to a user.
- **Index** — writes to the active `SearchIndex` backend.
- **Aggregate** — updates `MetricSnapshot`/daily aggregates so dashboards
  never scan raw tables.
- **Alert** — alert engine evaluation (see ARCHITECTURE.md).
- **AI Insight / Report** — on-demand or scheduled synthesis jobs.

## Job system (brief §34)

BullMQ (Redis-backed) queues, one queue family per job type
(`crawl_source`, `process_article`, `deduplicate`, `generate_embedding`,
`classify_mention`, `detect_spike`, `generate_insight`, `generate_digest`,
`generate_report`). Each job record tracks `status`, `attempts`,
`started_at`, `completed_at`, `error`, `source_id`. Retries use exponential
backoff; jobs exhausting retries move to a dead-letter queue surfaced in
Admin (brief §85) rather than disappearing silently.

## Source health & fault tolerance (brief §70, §93, §135)

A `Source` has a `status` (healthy/delayed/error/blocked/unavailable)
computed from recent job outcomes. Repeated failures trigger backoff, not
infinite retry; sustained failure surfaces to Admin, not just logs. One
source's failure never blocks other sources' jobs — each `crawl_source`
job is independent.

## Content rights enforcement (ADR-004, brief §31, §127)

`SourcePolicy` is enforced in code, not just documented: the normalize
stage strips fields the policy forbids storing before the row is ever
written, and the render layer (mention list/detail) strips fields the
policy forbids *displaying* even if a broader set happens to be stored
(defense in depth, since a policy can be tightened after ingestion).
Scraped HTML is sanitized (script/iframe/event-handlers stripped) before
any excerpt is rendered.

## What ingestion never does

- Never bypasses paywall, login, or explicit access control.
- Never ignores robots.txt on Web/Sitemap connectors without an explicit,
  recorded per-source override justified by the source's own terms.
- Never fabricates a field (reach, engagement, sentiment) when the source
  didn't provide the underlying data — see DATA_MODEL.md EngagementMetric.
- Never treats fetched content as anything other than untrusted data when
  it reaches the AI layer (see AI_ARCHITECTURE.md prompt injection
  handling).
