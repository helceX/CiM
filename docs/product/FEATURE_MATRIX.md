# Feature Matrix — Phase × Module

Status legend: `MVP` (this build target), `P2`, `P3`, `P4` (future phase),
`—` (not planned / explicit non-goal).

| Module | MVP | P2 | P3 | P4 |
|---|---|---|---|---|
| Public site (marketing, pricing, security, docs) | ✅ | | | |
| Registration / email verification / login | ✅ | | | |
| Onboarding wizard | ✅ | | | |
| Organizations / Workspaces / Projects | ✅ | | | |
| RBAC (fixed roles) | ✅ | Custom roles | | |
| Monitoring queries (simple builder) | ✅ | | | |
| Boolean / advanced query mode | ✅ | Query quality assistant | | |
| Query preview ("test before save") | ✅ | | | |
| Source connectors: Mock, RSS, Sitemap, Web | ✅ | API connector | Social/YouTube/Podcast/Broadcast | |
| Ingestion pipeline (fetch→normalize→dedupe→index) | ✅ | | | |
| Mentions list + detail drawer | ✅ | Collaboration (assign/comment/tag) | | |
| Deduplication / story clustering | Dedup only | Full story clustering | | |
| Search (Postgres full-text) | ✅ | Meilisearch + facets | Semantic/vector search | |
| Alerts: keyword, high-relevance, spike | ✅ | Sentiment shift, competitor, engagement spike, emerging topic, crisis | | |
| Alert fatigue controls (grouping/cooldown) | ✅ | | | |
| Notification center (in-app) | ✅ | Slack/Teams/webhook channels | | |
| Email daily digest | ✅ | Weekly/monthly/yearly scheduled reports | | |
| Reports: fixed templates, PDF/CSV export | ✅ | Report builder (custom sections), XLSX, sharing links | | |
| Dashboard: KPIs, trend, top stories, topics, sentiment | ✅ | Competitor comparison, source distribution depth | | |
| Analytics deep views | Basic (volume, sentiment, sources) | Full matrix (§25 of brief) | Journalist/author, geography | |
| AI: summary, sentiment, entities, topics | ✅ (grounded, evidence-linked) | Recommendations, executive brief automation | | |
| AI Assistant (context-aware) | — | ✅ | Deeper agentic workflows | |
| Crisis detection | — | Multi-signal detection | Predictive | |
| Competitor tracking | — | ✅ | | |
| AI Visibility (ChatGPT/Gemini/Claude/Perplexity tracking) | — | — | ✅ | |
| Admin panel (orgs, jobs, source health, system health) | ✅ (core) | Full observability views | | |
| Audit log | ✅ | | | |
| Data retention policy engine | Policy field only | Enforcement worker | | |
| API keys + public API | Internal only | | v1 public API | |
| Webhooks | — | ✅ | | |
| SSO/SAML/OIDC | Auth abstraction only | | Enterprise SSO | |
| Billing | Usage counters only | | Plan enforcement | |
| Incident management | — | — | | ✅ |
| Mobile/PWA | — | — | — | ✅ |

## MVP acceptance definition

A module is "done" only when UI + DB + API + worker + business rules +
notifications + tests + error states all work together (brief §153). A
feature with only a UI is not counted as delivered anywhere in this matrix.
