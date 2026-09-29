# CiM V2 Change Report — Phase 0 Repository Audit

Produced per the CiM V2 master prompt §166–167. This is an audit, not a
proposal to rewrite: the governing rule (§192) is *"does this change break
the existing working system?"* — where the answer is yes, the change gets a
migration plan, not a rewrite.

## Method

Read (not assumed) from the repository at the time of this audit: root
`package.json`, `pnpm-workspace.yaml`, every `apps/*/package.json` and
`packages/*/package.json`, `packages/db/src/schema/*.ts`,
`docs/architecture/ARCHITECTURE.md`, `DATA_MODEL.md`, `INGESTION.md`,
`ADR-004-INGESTION.md`, and the full `apps/web/src/app/**/page.tsx` route
tree. §0/§1 of the master prompt require verifying stack claims against the
lockfile rather than accepting them as given — several did not match (noted
below).

## Current architecture (verified)

- **Monorepo**: pnpm workspaces, `apps/web` (Next.js) + `apps/worker`
  (BullMQ/Redis consumers) + 9 `packages/*` (`ui`, `db`, `core`, `search`,
  `ingestion`, `ai`, `config`, `validation`, `reports`).
- **Stack** (verified against lockfile, not assumed): TypeScript 6.0.3,
  Drizzle ORM 0.45.2, Playwright 1.63.0, Vitest 5.0.1, Node `>=22.12.0`
  (master prompt guessed "Node 24.x" — not what's pinned; left as-is per
  §1, "change a major version only when necessary and justified").
- **Database**: PostgreSQL via Drizzle, forward-only reviewed migrations,
  full multi-tenancy (ADR-001) — every tenant-scoped table carries a
  non-nullable `organization_id` sourced from session, never from client
  input.
- **Auth**: Email + password, email verification (hashed single-use
  tokens), password reset (hashed single-use tokens), session-based,
  RBAC with both fixed roles and custom roles (Phase 38).
- **Ingestion**: `SourceConnector` interface already anticipates Social/
  YouTube/Podcast/Broadcast/Custom as Phase 3 connector types
  (`INGESTION.md` line 13-17, written before this V2 request existed).
  Implemented today: Mock, RSS, Sitemap, Web, API. Pipeline stages
  (discover→fetch→validate→normalize→dedupe→match→classify→index→
  aggregate→alert→insight→report) already match the master prompt's
  §72 pipeline description near-exactly.
- **AI**: Provider abstraction (`packages/ai`) with mock + Anthropic
  providers, cost-tiered enrichment, mandatory evidence layer
  (`InsightEvidence` — an Insight without evidence cannot render as a
  factual claim), untrusted-content handling for prompt injection.
- **Reports**: Builder with custom sections, PDF/XLSX/CSV, scheduling,
  signed expiring share links.
- **Alerts**: keyword/high_relevance/spike/sentiment_shift/emerging_topic/
  competitor, in-app + email + webhook (Slack/Teams-compatible) channels,
  cooldown-based fatigue control, StoryCluster-level grouping.
- **Billing**: usage counters + Free-tier plan enforcement (monitoring
  query cap) — no payment processing.
- **136 build phases already shipped** (see task history) — auth through
  RBAC custom roles, competitor tracking, Postgres FTS search, AI
  executive-brief email automation, multi-turn AI Assistant.

## Two material findings that change the master prompt's premises

### 1. No desktop application exists

Searched the full tree for `desktop`, `electron`, `tauri` — zero matches
outside this audit. There is no native shell, no second client, nothing
to "preserve" or share a backend with. **Decision (user-confirmed):** drop
every desktop-specific requirement (master prompt §5, §63–65, §159 —
OS notifications, system tray, web/desktop parity, native integrations).
CiM is a web-only product going forward. If a desktop shell is wanted
later, it is new work, not migration work, and out of scope here.

### 2. The public website and the full web application already exist

Master prompt §6/§7/§62/§63 describe building "a new web application"
and "a public website inside the same project" as if neither exists yet.
Both already exist and are substantially complete:

- **Public site** (route group `(public)`): `/`, `/features`,
  `/solutions`, `/pricing`, `/security`, `/resources`, `/contact`,
  `/login`, `/register`, `/verify-email`, `/forgot-password`,
  `/reset-password`, `/invitations/accept`.
- **Authenticated app** (route group `(app)`): `/dashboard`,
  `/monitoring` (+ create), `/mentions`, `/alerts` (+ create),
  `/analytics`, `/reports` (+ builder, scheduling, XLSX, share links),
  `/settings` (members, RBAC roles, API keys, data retention, billing).
- **Admin** (route group `(admin)`): `/admin`, per-job drill-down.

So §180's "Phase 1: web shell + auth + public site" and "Phase 2: web
dashboard exposing existing features" are **already done**. This audit
does not re-build them; it corrects the master prompt's Phase 1/2 against
reality and moves the effective starting point to the master prompt's
**Phase 3: Social Listening domain model**, which genuinely does not
exist yet.

## What's genuinely new (the real gap)

Everything under master prompt §22–58 (Social Listening) is net-new.
Notably, several of the data-model primitives it asks for (§118) **already
exist** under different names and should be extended, not duplicated,
per the master prompt's own §118 instruction ("Mevcut schema'da eşdeğer
entity varsa duplicate oluşturma"):

| Master prompt asks for | Already exists as | Action |
|---|---|---|
| `StoryCluster` (§39, §120) | `articles.storyClusterId` (`DATA_MODEL.md`) | Extend, don't recreate |
| `SocialMetricSnapshot` (§32–33, §118) | `engagementMetrics` (has `observedAt`, `isEstimated`, `measurementMethod`) — this already *is* the snapshot model | Extend `metricType` vocabulary, add velocity computation |
| `EntityAlias` (§83, §118) | `entities`/`entityAlias` (`packages/db/src/schema/ai.ts`, Phase 6) | Reuse for brand alias matching |
| `SourceCapability` (§28, §118) | `sources.canStoreFullText` etc. (`SourcePolicy`) | Extend with a platform capability matrix, same enforcement pattern |
| `ConnectorHealth` (§74, §118) | `sources.status`/`lastCheckedAt` | Reuse; add per-capability granularity |
| `AIInsightEvidence` (§118) | `insightEvidence` (Phase 6) | Reuse as-is |

Genuinely new, no existing equivalent:

- `socialProfiles` — structured author entity (followers, verified,
  account type) distinct from `articles.authorName` (a plain string).
- `matchType` / `matchConfidence` / `matchedRule` on `mentions` — today
  matching only has `matchedTerms: text[]`, no typed match taxonomy
  (DIRECT_MENTION/EXACT_NAME/ALIAS/HASHTAG/URL/CONTEXTUAL/SEMANTIC).
- Real social platform connectors (X/Instagram/Facebook/LinkedIn/TikTok/
  YouTube/Reddit/Forums) — only the interface slot exists today
  (`INGESTION.md`), no implementation, mock or real.
- Semantic/"unprompted" brand-conversation detection — requires a new AI
  capability (`packages/ai`), not just a new connector.
- Social-specific alert types (creator spike, cross-platform spread,
  emerging narrative, unprompted-conversation spike).
- Social Listening dashboard screen.

## Migration strategy

No breaking schema changes are required for V2's first slice. Every new
social capability is additive:

1. New tables (`socialProfiles`) and new nullable columns
   (`mentions.matchType`, `mentions.matchConfidence`,
   `mentions.matchedRule`, `articles.authorProfileId`) — forward-only
   Drizzle migrations, reviewed as code, per existing convention
   (`DATA_MODEL.md` §Migrations).
2. Existing rows backfill `matchType = null` (rendered as "Not classified"
   in UI, following the codebase's existing "Not available" honesty
   convention — never fabricated).
3. `MockSocialConnector` ships first (mirrors `MockNewsConnector`'s
   existing role — full UX/E2E testable without live platform APIs),
   real connectors follow per master prompt §29 (official API first,
   never bypasses login/paywall/access control).
4. No existing route, table, or job is renamed or removed in this pass.

## Risk areas

- **Scope**: §22–58 alone (Social Listening core) is comparable in size
  to the ingestion + mentions + alerts + AI subsystems already built
  across ~20 of the 136 completed phases. Sequenced as incremental
  phases (schema → mock connector → matching → dashboard → alerts → AI
  summary), same discipline as every phase to date — not attempted as
  one change.
- **Fabricated-data risk** (§182–184): the highest-risk area of the
  entire social module. Reach/engagement/influence-score fields must
  follow the existing `engagementMetrics.isEstimated` /
  "Not available" discipline exactly — no new UI may quietly ship a
  fake number.
- **AI prompt injection** (§61, §111): social post content is
  higher-volume, higher-adversarial-exposure untrusted input than news
  articles. Existing `packages/ai` trust layer (system/user/source
  separation) must extend to social content, not get a parallel,
  weaker path.
- **Desktop drop**: any part of the existing product that assumed a
  future desktop client (none found) is not a concern — but noted here
  in case future code comments reference one.

## Immediate next steps (this session)

1. `docs/product/FEATURE_MATRIX_V2.md` — full feature matrix.
2. `docs/ux/SCREEN_INVENTORY_V2.md` — new/changed screens only (delta
   against existing `SCREEN_INVENTORY.md`).
3. `docs/architecture/ADR-006-SOCIAL-LISTENING.md` — match-type model,
   social data model, connector extension.
4. Begin Phase 43+ implementation: social data model → `MockSocialConnector`
   → match-type engine → Social Listening dashboard, each phase following
   the existing schema → worker → UI → tests → validate → commit/push
   discipline.
