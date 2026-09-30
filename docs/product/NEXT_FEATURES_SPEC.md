# Next features — specs

Three features requested after launch. They are specified here so the
marketing site can keep labelling them **Coming soon** honestly, and so each
can be built as its own small, reviewable PR. Suggested order: **1 → 3 → 2**
(groups are the smallest and unlock better reporting; metering must exist
before pricing can be announced; the builder is the largest).

## 1. Brand groups (own brands vs. competitors)

> **Status: shipped (v1).** Groups CRUD + query assignment in Settings, group filter on Mentions, group comparison on the Dashboard. Not yet: the "group vs. group" competitor alert and the report section (see *Behaviour* below).

**Problem.** Today a monitoring query has a single `trackingTarget` label
(`company`, `competitor`, …) and the Dashboard's "Competitor comparison"
groups by it. Teams want named clusters — "Our brands", "Competitor A",
"Category X" — and to compare clusters, not individual queries.

**Model.**
- `brand_groups(id, organization_id, project_id, name, kind, color, created_at, deleted_at)`
  where `kind ∈ own | competitor | category`.
- `monitoring_queries.brand_group_id uuid null references brand_groups on delete set null`.
  A query belongs to at most one group; ungrouped queries behave as today.
- Migration back-fills nothing; `trackingTarget = 'competitor'` queries keep
  working and are offered a one-click "move into a group" on the groups page.

**Behaviour.**
- CRUD on Settings → *Brand groups* (RBAC: same permission as editing
  monitoring queries; custom roles get a `brandGroups.manage` capability).
- Group filter in the Mentions filter bar, Analytics and Social pages; group
  colour used in charts (validated palette, never colour alone).
- Comparison view: own vs. competitor groups — share of voice, sentiment mix,
  volume trend. "Share of voice" = group mentions ÷ sum of compared groups in
  the period; always shows the denominator and the period.
- Competitor alert type keeps working and gains "group vs. group".
- Reports: new report section "Group comparison".

**Non-goals (v1).** Nested groups; a query in several groups; auto-assigning
queries to groups with AI.

**Tests.** Repository tests for CRUD + tenant isolation (IDOR suite entry),
share-of-voice maths with zero-denominator handling, e2e: create group →
assign query → filter mentions → comparison renders.

## 2. Chart & table builder

> **Status: slice 1 shipped (engine only, no UI yet).** `saved_visuals` table, the closed-vocabulary spec (`visualSpecSchema`: measures `mentions | unique_sources | high_priority | negative_share`; dimensions `day | week | source | source_type | sentiment | brand_group | query`), the tenant-scoped query compiler + `runVisual` (5 s statement timeout, 1000-row cap, zero-filled time series) and repository CRUD. **Next slices:** API + builder screen with live preview, pin to Dashboard, add to report, CSV/XLSX export. Not yet: `topic` dimension, `breakdown`, `stacked_bar` data shape.

**Problem.** Fixed dashboards and templates cannot answer every question; users
want to build their own visuals from monitoring data and place them in
reports/dashboards.

**Model.**
- `saved_visuals(id, organization_id, project_id, created_by, name, kind, spec jsonb, created_at, updated_at, deleted_at)`,
  `kind ∈ chart | table`.
- `spec` (validated by a shared zod schema in `packages/validation`) is
  declarative and **never contains SQL**: `{ measure, dimension, breakdown?, filters, period, chartType?, columns?, sort?, limit }`.
  - measures: `mentions`, `sentiment_share`, `unique_sources`, `high_priority`
  - dimensions: `day | week | source | source_type | sentiment | topic | brand_group | query`
  - chart types: `line | bar | stacked_bar | area | pie(≤6 slices) | table`
- A query compiler in `packages/core` turns a spec into a parameterised Drizzle
  query, always scoped by `organization_id` (compiler takes the tenant context,
  not the spec).

**Behaviour.**
- Builder screen: pick measure → dimension → filters → live preview; chart-type
  suggestions from the data shape (`dataviz` skill rules: right form for the
  job, fixed categorical order, one axis, table view always available).
- Save, duplicate, delete; add to a report as a custom section (reuses the
  report-builder sections mechanism) and pin to the Dashboard.
- Export a table to CSV/XLSX; charts render in PDF via the existing report
  renderer.
- Guard rails: row limit (e.g. 1000), period ≤ retention window, 5 s statement
  timeout, rate limit on preview.

**Non-goals (v1).** Free-form SQL; joins across orgs; cross-project visuals;
calculated fields.

**Tests.** Compiler unit tests (every measure × dimension, tenant scoping
snapshot), zod schema fuzz for injection, IDOR test on saved visuals,
axe scan on the builder, e2e build → save → add to report → PDF contains it.

## 3. Credit metering (per-keyword pricing)

> **Status: measure-only v1 shipped.** Tracked-keyword counting, the append-only `credit_ledger`, an idempotent daily `keyword_day` debit (inside the existing daily usage job) and a Settings usage view. **Not built, by design, until the open decisions below are answered:** grants/allowances per plan, the `ai_call` debit, low-balance banners, blocking new keywords at 100 %, admin grant UI, and any payment provider.

**Problem.** Pricing is intentionally not fixed yet; the direction is a credit
pool priced by the keywords a customer actually tracks. Before any price is
announced the product must be able to *measure and (optionally) limit* usage
accurately.

**Definitions (proposal — to confirm before building).**
- **Tracked keyword** = a distinct, normalised include-term or exact phrase
  across the organization's *active* monitoring queries (exclusions are free).
- **Credits** are consumed per tracked keyword per day (metered daily from the
  count at snapshot time), plus optionally per AI call.
- Plans become *credit allowances*, not feature tiers; features are not gated
  by plan except `enterprise` extras (SSO, custom retention).

**Model.**
- Reuse `featureUsageSnapshots` (already counts keywords/AI credits) and add
  `credit_ledger(id, organization_id, occurred_at, kind, amount, reason, ref_id)`
  with `kind ∈ grant | keyword_day | ai_call | adjustment`, append-only; balance
  = `SUM(amount)`.
- Daily worker job `meter_keywords` writes one `keyword_day` debit per org from
  the distinct-keyword count (idempotent per org/day via a unique
  `(organization_id, kind, ref_id)` key where `ref_id = date`).
- Enforcement is a soft mode first: banner at 80 %, block *creating new
  keywords* at 100 % (never delete or pause existing monitoring silently).

**Behaviour.**
- Settings → *Usage*: balance, burn per day, keywords by query, forecast
  ("lasts ~N days at the current rate").
- Admin: grant/adjust credits with audit-log entry.
- Marketing: pricing page stays "Coming soon" until definitions above are
  confirmed and a payment provider is chosen (out of scope here).

**Open decisions for the owner.** Keyword definition (per keyword vs. per
query vs. per source), whether AI calls cost credits, free allowance, and the
payment provider (Stripe vs. iyzico for TR customers).

**Tests.** Keyword normalisation/dedupe unit tests, ledger idempotency (job run
twice), balance under concurrent debits, IDOR on usage endpoints, e2e: create
keywords → job → balance decreases → limit banner.
