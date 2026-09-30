# Data Model

Storage: PostgreSQL (system of record) via Drizzle ORM. Search index and
vector embeddings are derived data, rebuildable from Postgres (ADR-002).

This document describes entities and relationships; exact column-level
schema lives in `packages/db/src/schema/*.ts` as the executable source of
truth — keep both in sync when either changes.

## Identity & tenancy

- **User** — global identity (email, password hash, verified_at, timezone,
  locale). A user can belong to multiple Organizations via membership.
- **Organization** — the tenant boundary. Every tenant-scoped table below
  carries `organization_id` (see ADR-001).
- **OrganizationMembership** — (user_id, organization_id, role,
  invited_by, status). Role is one of the fixed RBAC roles (§3 of brief);
  designed so a future `CustomRole` table can be added without breaking
  the enum-based default roles (store role as a string key resolved
  against a permission table, not a hard enum, from day one).
- **Workspace** — sits between Organization and Project; MVP creates one
  default workspace per organization at registration, multi-workspace UI
  is not required for MVP but the table exists so it isn't a breaking
  change later.
- **Project** — a monitoring context (e.g. "BTM Corporate"). Owns
  MonitoringQueries, Sources selection, Alerts, Reports, membership.

## Monitoring & sources

- **MonitoringQuery** — belongs to Project. Stores both a structured
  `QueryAST` (JSON) and the canonical Boolean string representation, so
  simple/advanced editor modes never diverge (see SEARCH.md).
- **QueryRule** — optional normalized breakout of include/exclude/exact
  terms for fast pre-filtering before full query evaluation.
- **Source** — a publisher/feed (name, domain, country, language, type,
  status, connector, policy). See `SourcePolicy` below for rights.
- **SourceConnector** — config instance of a connector type bound to a
  Source (credentials reference, polling interval, connector-specific
  settings). Never stores raw secrets — references `Integration`/secret
  store entries.
- **SourcePolicy** — `can_store_full_text`, `can_display_full_text`,
  `can_display_excerpt`, `can_store_media`, `can_process_ai`,
  `retention_period`, `license`, `terms_url`. Enforced at ingestion time,
  not just documented (ADR-004, SECURITY.md).

## Content

- **Article** — canonical normalized content unit produced by ingestion:
  `canonical_url`, `content_hash`, `title`, `stored_excerpt` (subject to
  SourcePolicy — may be null if policy forbids storage), `published_at`,
  `fetched_at`, `language`, `source_id`, `author_id`.
- **ArticleVersion** — append-only history when a source republishes with
  edits (headline changes, corrections) — keeps `Article` mutable-safe
  without losing history.
- **Author** — extracted/declared author, linkable to journalist
  intelligence in later phases.
- **StoryCluster** — groups Articles judged to be the same underlying
  story (canonical URL / content hash / title similarity / semantic
  similarity / timing — see ARCHITECTURE.md ingestion flow and
  INGESTION.md). A cluster has a representative Article and aggregate
  stats (source count, first-seen, velocity).
- **Mention** — the tenant-scoped join between an Article and a
  MonitoringQuery match: `organization_id`, `project_id`, `query_id`,
  `article_id`, `matched_terms`, `relevance_score`, `sentiment` (+
  `sentiment_confidence`), `priority`, `status` (new/reviewed/archived),
  `assigned_to`. One Article can produce Mentions across many tenants
  without duplicating the Article row (many-to-one Article→Mention,
  tenant isolation lives on Mention, not Article).
- **Entity** — Company/Brand/Person/Product/Organization/Place/Topic, with
  an **EntityAlias** table (alias → entity_id) for the alias/synonym system
  (§13, §102).
- **Topic** — AI/derived grouping, distinct from user-defined Tags.
- **Tag** — user-created label, tenant-scoped.

## Metrics (brief §26 — never fabricated)

- **EngagementMetric** — `article_id`, `metric_type` (likes/comments/
  shares/views/…), `value`, `source`, `observed_at`,
  `measurement_method`, `confidence`, `is_estimated`. Absence of a row for
  a metric type means "Not available" in the UI — there is no default
  fallback value.
- **MetricSnapshot** — point-in-time aggregate (mention volume, reach,
  engagement, sentiment mix) at organization/project/query granularity,
  written by the aggregation pipeline, not computed ad hoc per dashboard
  load (ARCHITECTURE.md, §73).
- **DailyAggregate / MonthlyAggregate** — pre-rolled tables the dashboard
  and reports query directly, keeping raw `Mention`/`EngagementMetric`
  scans out of the request path.

## Alerts & notifications

- **AlertRule** — type, scope (project/query), threshold/sensitivity,
  channels, delivery cadence, quiet-hours config.
- **AlertEvent** — a rule firing, deduplicated/grouped at the StoryCluster
  level where applicable (brief §19) before becoming a Notification.
- **Notification** — per-user delivery record (read/unread/archived,
  channel, related entity reference).
- **Digest** — generated daily/weekly digest content + delivery status.

## Reports & insights

- **Report** — definition (sections, period type — calendar vs rolling,
  see brief §74), owner, sharing settings.
- **ReportSection** — ordered section within a Report (type + config).
- **ReportRun** — one generated execution of a Report (status, output
  files, error, requested_by, period bounds actually used).
- **Insight** — AI-generated insight (`kind`: executive_summary/
  whats_changed/risk/opportunity/…, `summary`, `confidence`, `method`).
- **InsightEvidence** — links an Insight to the Mentions/Articles/metrics
  that support it — mandatory, not optional (AI_ARCHITECTURE.md Trust
  Layer). An Insight without at least one InsightEvidence row cannot be
  displayed as a factual claim.

## Jobs & platform

- **CrawlJob / AIJob** — queue-backed job records mirroring BullMQ jobs
  for status/observability (`status`, `attempts`, `started_at`,
  `completed_at`, `error`, `source_id`).
- **Integration** — external connection config (Slack/Teams/webhook/email
  provider/AI provider), secret referenced not stored inline.
- **ApiKey** — `organization_id`, `hashed_secret`, `scopes[]`,
  `created_by`, `last_used_at`. Raw secret shown once at creation only.
- **AuditLog** — `organization_id`, `actor_id`, `action`, `target_type`,
  `target_id`, `metadata`, `created_at`. Append-only.
- **Subscription / FeatureUsage** — plan + usage counters (keywords,
  sources, mentions, AI credits, reports, users, retention) — populated
  from day one even though billing enforcement is a later phase, so usage
  history isn't lost waiting for billing to ship.
- **DataRetentionPolicy** — per-organization retention config consumed by
  a cleanup worker (policy exists in MVP schema; enforcement worker is
  scheduled per `FEATURE_MATRIX.md`).

## Conventions

- Every table: `id` (uuid), `created_at`, `updated_at` (timestamptz, UTC).
- Tenant-scoped tables: non-nullable `organization_id` with an FK and a
  composite index `(organization_id, <primary access pattern column>)` —
  e.g. `(organization_id, created_at)` on Mention, `(organization_id,
  project_id)` on MonitoringQuery.
- Soft-delete (`deleted_at`) only where "undo"/audit value justifies it
  (Project, MonitoringQuery, Report, AlertRule); hard-delete otherwise.
- No table gets a tenant column "automatically" — it's added because the
  table holds tenant data, per ADR-001; global/reference tables (Source,
  Entity, Article, Author) are intentionally NOT tenant-scoped since
  content is shared infrastructure — tenant-specific meaning attaches via
  Mention/Tag/SavedView, never by copying Article rows per tenant.

## Migrations

Drizzle Kit generates SQL migrations from schema changes; migrations are
forward-only and reviewed as code. Seed data is a separate script
(`packages/db/seed`), never mixed into migration files.
