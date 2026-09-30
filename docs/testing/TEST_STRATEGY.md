# Test Strategy

## Levels

**Unit** (Vitest) — pure domain logic, run on every change:
- Query parser (Boolean AST build + evaluation)
- Deduplication (canonical URL / content hash / title similarity)
- Media Impact Score calculation
- Alert engine (dedupe, cooldown, grouping, thresholds)
- Tenant isolation helpers (query scoping utilities)
- Metric aggregation (rollups, spike/baseline statistics)
- Date/timezone handling (UTC storage ⇄ display conversion)

**Integration** (Vitest + real Postgres/Redis via Docker, or testcontainers):
- Drizzle repositories against a real Postgres instance
- Worker job handlers (crawl_source, process_article, generate_digest, …)
- Ingestion pipeline stages end-to-end with the mock connector
- Search abstraction against the configured backend

**E2E** (Playwright):
- Register → verify email (mock email provider capture) → onboarding →
  dashboard shows data
- Login / logout / session expiry
- Create monitoring query → preview → save → appears in Mentions
- Filter mentions, open detail drawer, mark relevant/irrelevant
- Create alert rule → simulate trigger → notification appears
- Generate a report → download

**Accessibility** (Playwright + axe-core):
- Keyboard-only navigation through primary flows
- Focus visibility, landmark/heading structure, form labels, ARIA on
  custom components (Command Palette, Drawer, Combobox), color-contrast
  checks on design tokens

**Security** (see `docs/architecture/SECURITY.md` for full list) — treated
as its own suite, not optional:
- Cross-tenant data access / IDOR attempts across every list & detail API
- SSRF attempts against the crawler (localhost, private ranges, metadata
  endpoints, DNS-rebinding pattern)
- Auth: session fixation, password hashing, rate limiting on
  login/register/reset
- Prompt-injection fixtures: scraped content containing
  "ignore previous instructions" style payloads must not alter AI output
  structure or leak into system-level behavior

## What "done" requires per feature (brief §153)

UI + DB + API + worker + business rules + notifications + tests + explicit
error states. A PR that only adds UI for a data-backed feature is not
mergeable as "done" — it must be flagged as scaffolding-only if shipped
incrementally, and the app must not present it as functional in the
interim (no "coming soon" that looks live).

## Test data

Seed data (`packages/db/seed`) is synthetic and clearly fictional — no real
brand's real coverage is fabricated as demo content. Mock connector
(`MockNewsConnector`) implements the same `SourceConnector` interface as
real connectors so E2E tests exercise the real pipeline without live
network access.

## CI gates (GitHub Actions)

On every PR: install → typecheck → lint → unit → integration (with
docker-compose services) → build. E2E and a11y suites run on PRs touching
`apps/web` or `packages/ui`. No merge on red CI; no skipped/quarantined
tests to force green (brief §125/§136 apply to the product's own CI too).
