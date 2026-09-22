# Feature Matrix — Phase × Module

Status legend: `MVP` (this build target), `P2`, `P3`, `P4` (future phase),
`—` (not planned / explicit non-goal).

## Build status (within MVP scope)

Shipped, working end-to-end against a real database and job queue: public
site; registration/verification/login/logout/password reset; onboarding
wizard; organizations/workspaces/projects; RBAC permission checks; audit
log; monitoring queries (simple + advanced builder, preview); source
abstraction + `MockNewsConnector`; ingestion pipeline (fetch → normalize →
dedupe → query match); worker job queue (BullMQ) with a scheduled crawl
cycle; dashboard reading real tenant-scoped data with a mention-trend
chart; Mentions table (filters, search, pagination) + Mention Detail
Drawer ("why did this match", relevant/irrelevant/duplicate feedback);
Analytics (mention volume, sentiment trend, source distribution, topics
by monitoring query with period-over-period change — all DB-aggregated,
zero-filled series, real Recharts visualizations); alert rules (keyword,
high-relevance, spike) evaluated by the worker against real ingestion
output — keyword rules on any new mention, high-relevance rules only on
an exact-phrase match (`computeMatchPriority`), spike rules off a real
24-hour zero-filled statistical baseline (mean + 3×stddev or 3× baseline,
with a minimum absolute-count floor) — with per-rule cooldown to prevent
alert fatigue; notifications fan out in-app (Notification Center, unread
badge, mark read/mark all read) and by email (provider-agnostic
`email_outbox` → BullMQ `send_email` job), scoped to active organization
members only; AI enrichment (`packages/ai`, ADR-003) — provider-agnostic
interface behind a `MockAIProvider` (deterministic heuristic, the default
until a real key is configured) and a real `AnthropicAIProvider`
(structured tool-output, schema-validated, retry-then-fail, prompt
injection defended by construction — SOURCE CONTENT is always a delimited,
forced-tool-choice call, never free text the model could be steered by);
the worker's `ai_enrich` job runs sentiment/entities/topics/summary per
Mention (content-hash-cached across Mentions of the same Article, so
identical content is analyzed once) and `insight_generate` produces a
grounded, evidence-linked "since yesterday" Insight per project — both
surfaced end to end: Mention Detail Drawer (sentiment, summary,
confidence, method, entities, topics, honest "Not available" per
`ai_status`) and the dashboard's Insight card (Answer/Evidence/Confidence/
Method, AI_ARCHITECTURE.md Trust Layer — an Insight with zero evidence
rows is never rendered); reports (`packages/reports`) — two fixed
templates (Weekly Summary, Monitoring Overview; the reorderable custom
section builder is P2), generated on demand by the worker's
`generate_report` job (never inline in a request): real tenant analytics
data (the same repositories Dashboard/Analytics already read) rendered to
an HTML document using the product's actual design tokens, then to a real
PDF via headless Chromium and a hand-written CSV, both stored and
downloadable, with the requesting user notified when ready — or told
exactly what failed, never a silently missing report; a Platform Super
Admin panel (`/admin`, `users.is_platform_super_admin`, entirely separate
from any organization role) — real, live operational aggregates across
every tenant: database/Redis reachability, per-queue BullMQ job counts
(waiting/active/completed/failed/delayed) for all seven queues, an
organization list with real member/project/mention counts, and source
health across every tenant. Deliberately never a way to browse a
tenant's actual mentions/queries/content (docs/architecture/SECURITY.md
brief §86 — no implicit access to tenant application views); a
non-admin user hitting `/admin` gets a plain 404, not a redirect that
would confirm the panel exists.

Deliberately not built yet: full AI-clustered story clustering (brief
§17/§151 Phase 3's "story clusters") — MVP scope here is dedup only
(canonical URL / content hash); clustering near-duplicate coverage across
sources needs title/semantic similarity and multi-source overlapping
content the mock connector doesn't yet produce. Building it now would be
shallow — leaving it explicitly deferred is the honest call per brief
§154. AI risk detection and recommendations are P2 (FEATURE_MATRIX table
below) — not called by the enrichment pipeline in this MVP.

Phase 10 closed the two remaining MVP-scope gaps: real `RSSConnector`
(RSS 2.0 + Atom), `SitemapConnector` (urlset + bounded sitemapindex
nesting, newest-first, capped pages per crawl), and `WebConnector`
(single polled page) — all three SSRF-guarded (DNS-pinned resolve-then-
connect, no unrevalidated redirect-follow, response size/timeout caps,
docs/architecture/SECURITY.md) and robots.txt-respecting (Web/Sitemap;
RSS feeds are meant to be polled and are exempt, same as every real
crawler); and the scheduled `generate_digest` job — one daily
(08:00 UTC) email per organization member summarizing new mentions and
sentiment in the last 24h, skipped entirely for a quiet organization
rather than sending an empty digest, using the same cross-tenant
fan-out-across-active-organizations pattern as spike alerts and insight
generation (excluding soft-deleted organizations).

| Module | MVP | P2 | P3 | P4 |
|---|---|---|---|---|
| Public site (marketing, pricing, security, docs) | ✅ | | | |
| Registration / email verification / login | ✅ | | | |
| Onboarding wizard | ✅ | | | |
| Organizations / Workspaces / Projects | ✅ | | | |
| RBAC (fixed roles) | ✅ | Custom roles | | |
| Monitoring queries (simple builder) | ✅ | | | |
| Boolean / advanced query mode | ✅ | ✅ Query quality assistant | | |
| Query preview ("test before save") | ✅ | | | |
| Source connectors: Mock, RSS, Sitemap, Web, API | ✅ | | Social/YouTube/Podcast/Broadcast | |
| Ingestion pipeline (fetch→normalize→dedupe→index) | ✅ | | | |
| Mentions list + detail drawer | ✅ (assign, tag) | Collaboration (comment) | | |
| Deduplication / story clustering | Dedup only | Full story clustering | | |
| Search (Postgres full-text) | ✅ | Meilisearch + facets | Semantic/vector search | |
| Alerts: keyword, high-relevance, spike | ✅ | ✅ Sentiment shift, ✅ emerging topic, ✅ competitor, engagement spike, crisis | | |
| Alert fatigue controls (grouping/cooldown) | ✅ | | | |
| Notification center (in-app) | ✅ | ✅ (Slack/Teams/webhook channels) | | |
| Email daily digest | ✅ | Weekly/monthly/yearly scheduled reports | | |
| Reports: fixed templates, PDF/CSV export | ✅ | ✅ Report builder (custom, reorderable sections), XLSX, sharing links | | |
| Dashboard: KPIs, trend, top stories, topics, sentiment | ✅ | ✅ Competitor comparison, source distribution depth | | |
| Analytics deep views | Basic (volume, sentiment, sources) | Full matrix (§25 of brief) | Journalist/author, geography | |
| AI: summary, sentiment, entities, topics | ✅ (grounded, evidence-linked) | ✅ Recommendations (Recommendation/Why/Evidence/Priority/Confidence), executive brief automation | | |
| AI Assistant (context-aware) | — | ✅ (dashboard, single-turn Q&A) | Deeper agentic workflows, multi-turn | |
| Crisis detection | — | Multi-signal detection | Predictive | |
| Competitor tracking | — | ✅ (query tracking-target tagging, dashboard comparison) | | |
| AI Visibility (ChatGPT/Gemini/Claude/Perplexity tracking) | — | — | ✅ | |
| Admin panel (orgs, jobs, source health, system health) | ✅ (core) | ✅ Full observability views (per-job failure drill-down) | | |
| Audit log | ✅ | | | |
| Data retention policy engine | Policy field only | ✅ Enforcement worker | | |
| API keys + public API | ✅ (internal, scoped, revocable) | | v1 public API | |
| Webhooks | — | ✅ | | |
| SSO/SAML/OIDC | Auth abstraction only | | Enterprise SSO | |
| Billing | ✅ Usage counters only | | Plan enforcement | |
| Incident management | — | — | | ✅ |
| Mobile/PWA | — | — | — | ✅ |

## MVP acceptance definition

A module is "done" only when UI + DB + API + worker + business rules +
notifications + tests + error states all work together (brief §153). A
feature with only a UI is not counted as delivered anywhere in this matrix.
