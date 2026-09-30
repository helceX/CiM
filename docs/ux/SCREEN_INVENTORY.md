# Screen Inventory

Scope for the first high-quality implementation pass (brief §160), in
build order. Each entry: purpose, primary components, key states.

## 1. Public Landing (`/`)
Purpose: explain the product to a communications/PR buyer in one scroll,
route to register/login. Components: nav, hero, feature highlights
(tracking/deduping/alerts/insights loop), security/trust section link,
footer. States: n/a (static, no auth-dependent content).

## 2. Registration (`/register`)
Purpose: create User+Organization+Workspace. Fields: first name, last
name, work email, company, role/position, password (with strength
guidance). States: validation errors (inline, field-level), submitting,
success ("check your email"), duplicate-email error (safe messaging, no
account enumeration beyond what's necessary).

## 3. Email Verification (`/verify-email`)
Purpose: consume token, activate session, route to onboarding.
States: verifying (loading), success (auto-redirect), expired/invalid
token (resend action), already-verified (redirect to login/dashboard).

## 4. Login (`/login`)
Purpose: authenticate, resume session. Fields: email, password, "forgot
password" link. States: invalid credentials (generic message, no
enumeration), rate-limited, unverified account (resend verification
action), success (redirect to last workspace or onboarding if incomplete).

## 5. Onboarding (5-step wizard)
Purpose: get the user to real dashboard data in under 3 minutes (see
`USER_FLOWS.md`). Steps: track-type → keywords → sources → notification
preference → finish. Components: stepper, chip input, source checklist,
preference radio group. States: step validation, skip-after-step-2 with
defaults, completion (creates Project + MonitoringQuery, redirects).

## 6. Dashboard (`/app`)
Purpose: "what happened, why it matters, what to check now" in <10s.
Sections (see PRODUCT_VISION/USER_FLOWS): date range selector, controlled
KPI row, Executive Brief (AI, evidence-linked), Mention Trend chart, Top
Stories, Emerging Topics, Source Distribution, Sentiment Trend,
Competitor Comparison (when competitors configured). States: empty
(no monitoring yet → CTA), loading (skeleton per section, not full-page
blank), data-fresh indicator per section.

## 7. Monitoring List (`/app/monitoring`)
Purpose: manage `MonitoringQuery` rows for the active Project. Table:
name, keywords summary, sources, mention volume (7d), status, last
match. Row actions: edit, pause, duplicate, delete. Empty state: teaches
+ CTA to step 8.

## 8. Create/Edit Monitoring (`/app/monitoring/new`, `/app/monitoring/[id]`)
Purpose: build a `MonitoringQuery`. Simple mode (chip include/exclude,
source picker) ⇄ Advanced mode (Boolean syntax editor with syntax
highlighting), "Preview results" panel (count + sample matches, breadth
warning). Save/Cancel, unsaved-changes guard.

## 9. Mentions (`/app/mentions`)
Purpose: primary working table. `FilterBar` (date, project, source,
type, sentiment, topic, entity, priority, engagement, reach, language) +
saved views. `DataTable` with column customization, bulk select, bulk
actions (mark reviewed/irrelevant, add to report). Row click opens
Mention Detail Drawer without navigation loss.

## 10. Mention Detail Drawer
Purpose: full context on one mention without leaving the table. Sections:
headline/source/author/published/fetched/canonical URL, matched terms +
"why did this match?", related topics/stories, sentiment (+confidence),
entities, engagement/reach (or "Not available"), AI summary/insight
(evidence-linked), relevant/irrelevant/duplicate feedback actions.

## 11. Alerts (`/app/alerts`)
Purpose: manage `AlertRule`s + review `AlertEvent` history. List +
create/edit form (type, scope, threshold, channels, delivery cadence,
quiet hours). Event history shows grouped/deduplicated events, not raw
per-source spam.

## 12. Analytics (`/app/analytics`)
Purpose: MVP-scope deep views (mention volume/velocity, unique sources,
sentiment + change, topic distribution, source distribution, basic
competitor comparison). Charts read from precomputed aggregates, never
raw table scans (per `ARCHITECTURE.md`/`DATA_MODEL.md`).

## 13. Reports (`/app/reports`)
Purpose: list `Report`/`ReportRun`s, launch from template, access Report
Builder. States: generating, ready (download/share), failed (retry +
error reference, per brief §136).

## 14. Report Builder (`/app/reports/[id]/edit`)
Purpose: assemble/reorder sections (Overview/KPI/Trend/Top Stories/
Sources/Sentiment/Topics/Competitors/AI Insight/Recommendations), set
period (calendar vs. rolling, explicitly labeled), save/duplicate/
schedule/export/share.

## 15. Sources (`/app/sources`)
Purpose: source management + health. Table: name, type, status
(healthy/delayed/error/blocked/unavailable), last checked, coverage.
Detail: policy fields (rights), connector config, health history.

## 16. Projects (`/app/projects`)
Purpose: manage Projects within the Organization — create, members,
default queries/sources/dashboards association.

## 17. Settings (`/app/settings`)
Purpose: org profile, members/roles (RBAC), notification defaults,
timezone/locale, API keys, integrations (stubs where not yet built),
data retention policy (display + configure, enforcement per roadmap).

## 18. Organization Users (`/app/settings/members`)
Purpose: invite/manage members, assign roles, view pending invites,
revoke access. RBAC-gated to Owner/Admin.

## 19. Admin (`/admin`, Platform Super Admin only)
Purpose: platform-wide operational visibility — organizations, users,
mentions processed, job queue health, failed jobs, AI usage, source
health, system health, storage, search index status. Explicitly
separated from tenant app navigation/layout (ADR-001, brief §86).

## Consistency rules across all screens
One `FilterBar`, one `DataTable`, one `CommandPalette`, one Drawer
pattern, one empty-state component, one AI-output shape — implemented
once in `packages/ui`/`packages/core`, not re-implemented per screen.
