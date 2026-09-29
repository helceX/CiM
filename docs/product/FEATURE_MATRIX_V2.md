# Feature Matrix — V2 (Social Listening + Web/Public Consolidation)

Companion to `docs/product/PRODUCT_VISION.md`'s phase list. Columns follow
the master prompt's §168 request, adapted to this repo's actual surfaces
(no desktop client exists — see `docs/migration/CIM_V2_CHANGE_REPORT.md`).

Status legend: **Shipped** (in production code today) · **Extend**
(equivalent exists, needs new fields/behavior) · **New** (no equivalent
exists) · **Future** (explicitly out of scope for this pass).

| Feature | Web | Backend | AI | MVP | Phase | Status |
|---|---|---|---|---|---|---|
| Public marketing site (home/features/solutions/pricing/security/resources/contact) | Yes | — | — | Yes | 1 | Shipped |
| Auth (register/verify/login/reset) | Yes | Yes | — | Yes | 1 | Shipped |
| Org/Workspace/Project hierarchy | Yes | Yes | — | Yes | 1 | Shipped |
| RBAC (fixed + custom roles) | Yes | Yes | — | Yes | 1, 38 | Shipped |
| Monitoring query builder (simple + boolean) | Yes | Yes | — | Yes | 2 | Shipped |
| Ingestion: Mock/RSS/Sitemap/Web/API connectors | — | Yes | — | Yes | 2, 10, 23 | Shipped |
| Mentions list + detail + filters | Yes | Yes | — | Yes | 3 | Shipped |
| Mentions collaboration (assign/tag/comment) | Yes | Yes | — | Yes | 20, 24, 36 | Shipped |
| Analytics (volume/sentiment/source/topic) | Yes | Yes | — | Yes | 4, 37 | Shipped |
| Alerts (keyword/high_relevance/spike/sentiment_shift/emerging_topic/competitor) | Yes | Yes | — | Yes | 5, 15, 19, 32 | Shipped |
| Notification center | Yes | Yes | — | Yes | 5 | Shipped |
| AI enrichment (sentiment/summary/entities/topics) | — | Yes | Yes | Yes | 6 | Shipped |
| AI Assistant (multi-turn, evidence-backed) | Yes | Yes | Yes | Yes | 25, 41 | Shipped |
| AI recommendations / risk detection | Yes | Yes | Yes | Yes | 34, 35 | Shipped |
| AI executive brief (scheduled email) | — | Yes | Yes | Yes | 40 | Shipped |
| Reports (builder, sections, scheduling, PDF/XLSX/CSV, share links) | Yes | Yes | — | Yes | 7, 16, 21, 22, 31 | Shipped |
| Search (Postgres FTS, Turkish-aware) | Yes | Yes | — | Yes | 39 | Shipped |
| Competitor tracking | Yes | Yes | — | Yes | 30 | Shipped |
| Data retention policy + enforcement | Yes | Yes | — | Yes | 14, 18 | Shipped |
| Billing usage counters + plan enforcement | Yes | Yes | — | Yes | 29, 42 | Shipped |
| Internal API keys | Yes | Yes | — | Yes | 27 | Shipped |
| Query quality assistant | Yes | Yes | Yes | Yes | 28 | Shipped |
| Admin console (orgs/sources/jobs/health) | Yes | Yes | — | Yes | 8, 33 | Shipped |
| Webhook alert delivery (Slack/Teams-compatible) | Yes | Yes | — | Yes | 17, 26 | Shipped |
| Desktop application (OS notifications, tray, native integrations) | — | — | — | — | — | **Dropped** — no existing desktop client; out of scope (user-confirmed) |
| — | | | | | | |
| **Social profile entity** (followers/verified/account type) | Yes | Yes | — | Yes | 43 | New |
| **Match-type model** (DIRECT/EXACT/ALIAS/HASHTAG/URL/CONTEXTUAL/SEMANTIC + confidence) | Yes | Yes | Yes (semantic only) | Yes | 43 | New |
| **Mock social connector** | — | Yes | — | Yes | 44 | New |
| **"Why matched?" evidence UI** | Yes | Yes | — | Yes | 44 | New |
| **Social Listening dashboard** (KPIs, platform distribution, trending topics/hashtags, top authors/posts) | Yes | Yes | — | Yes | 45 | New |
| **Unprompted Brand Conversations** (semantic detection, no direct mention) | Yes | Yes | Yes | Phase 2 | 46 | New |
| **Engagement velocity** (rate-of-change over existing snapshots) | Yes | Yes | — | Phase 2 | 45 | Extend |
| **Real platform connectors** (X/Instagram/FB/LinkedIn/TikTok/YouTube/Reddit/Forums) | — | Yes | — | Phase 2/3 | 47+ | New — official API first, per §29 |
| **Platform capability matrix** (SUPPORTED/PARTIAL/PROVIDER_REQUIRED/UNAVAILABLE) | Yes | Yes | — | Phase 2 | 47 | New |
| **Cross-platform story propagation view** | Yes | Yes | — | Phase 2 | 48 | Extend (`storyClusterId` exists) |
| **Social-specific alert types** (creator spike, cross-platform spread, emerging narrative, unprompted-conversation spike) | Yes | Yes | — | Phase 2 | 46, 48 | New |
| **Social AI summary** ("what are people saying / what changed / who's driving it") | Yes | Yes | Yes | Phase 2 | 48 | Extend (reuses AI Assistant + evidence layer) |
| AI Visibility (ChatGPT/Claude/Gemini/Perplexity brand tracking) | — | — | — | — | Future | Future — roadmap only, per master prompt §96 |
| Global command palette (Cmd/Ctrl+K) | Yes | — | — | Phase 2 | — | Future |
| Public API `/api/v1` | — | Yes | — | Future | — | Future |
| Webhooks (mention.created/story.created/etc. outbound) | — | Yes | — | Future | — | Future — inbound-style webhook alert channel already shipped (Phase 17); outbound event webhooks are new |
| SSO/SAML/OIDC/MFA/Magic Link | Yes | Yes | — | Future | — | Future — auth abstraction already supports adding providers (email+password is the only implemented one) |
