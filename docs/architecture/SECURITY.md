# Security

## Baseline (brief §76)

HTTPS everywhere; secure, `httpOnly`, `SameSite` cookies for sessions;
CSRF protection on state-changing requests; output encoding/XSS
protection; parameterized queries only (Drizzle) — no raw SQL string
interpolation; rate limiting on auth and public endpoints; RBAC enforced
server-side on every request; audit logging on sensitive actions; secure
session management (rotation on privilege change, invalidation on
password change); Argon2id/bcrypt password hashing; MFA-ready auth
abstraction (not required for MVP, not architecturally blocked); secrets
via environment/secret manager only; strict input validation (Zod) at
every boundary; HTML sanitization on any rendered scraped content; file
upload validation (type/size/content sniffing, not extension trust).

## Multi-tenancy (ADR-001)

- `organization_id` is **never** read from client input (URL, body,
  header) for authorization decisions — it is resolved server-side from
  the authenticated session/membership on every request.
- Every repository function touching a tenant-scoped table requires an
  explicit `organizationId` parameter — there is no "unscoped" query
  helper available to call by mistake.
- Defense in depth: application-level scoping (primary enforcement) +
  composite indexes that make scoped queries the fast path + integration
  tests that specifically attempt cross-tenant reads/writes for every
  list and detail endpoint (IDOR suite in `TEST_STRATEGY.md`).

## SSRF (brief §77, high priority — this system fetches arbitrary URLs)

The crawler (`packages/ingestion`) fetches URLs derived from configured
Sources, which is inherently SSRF-risk surface. Controls:

- Resolve DNS and validate the resulting IP before connecting; reject
  loopback, link-local, private (RFC1918/RFC4193), and cloud metadata
  ranges (e.g. `169.254.169.254`) — checked against the **resolved IP**,
  not just the hostname, and re-checked at connect time to mitigate DNS
  rebinding (resolve-then-connect using the validated IP, not a second
  DNS lookup).
- Explicit allowlist model for connector network egress where feasible;
  otherwise a blocklist of the ranges above plus configurable
  organization-controlled domains is denied by default.
- No redirect-follow that isn't itself re-validated against the same
  rules (open redirect → internal target is a classic SSRF bypass).
- Fetch timeouts and response size caps to prevent resource exhaustion via
  a malicious/huge response.

## Prompt injection

Covered in `AI_ARCHITECTURE.md` — scraped content is always untrusted
input, structurally separated from system/user instructions, and cannot
alter AI output schema or trigger tool-like behavior.

## Content rights / copyright (brief §31, non-negotiable)

`SourcePolicy` (`DATA_MODEL.md`) is enforced at ingestion and at render
time, independently, so a stricter policy applied later still protects
already-ingested content:

- Full text is stored only when `can_store_full_text` is true.
- Full text is displayed only when `can_display_full_text` is true;
  otherwise the UI shows only what the policy permits (headline, source,
  published_at, url, short excerpt, metadata, derived metrics) and links
  out to the source.
- Paywalled/authenticated content is never accessed by bypassing access
  control.
- `robots.txt` and each source's stated terms govern crawl behavior.

## Privacy / KVKK-readiness (brief §79–80)

Privacy-by-design: user/account data (identity, credentials, preferences)
is modeled and stored separately from public media data (Articles,
Mentions), so account data export/deletion never touches monitored media
content and vice versa. Supported from MVP: data export, account
deletion, organization deletion, audit trail of these actions.
`DataRetentionPolicy` per organization (schema in MVP, enforcement worker
scheduled per `FEATURE_MATRIX.md`) drives a cleanup job — not a manual
process.

## Audit log (brief §78)

Tenant-scoped, append-only. Written on: login/logout, user invite, role
change, monitoring query change, alert rule change, report
creation/deletion, API key creation, source configuration change, data
deletion. Never contains secrets or full scraped content — references
entities by id.

## API keys (brief §83)

Created secret is shown exactly once; only its hash is stored. Scoped
permissions (`read:mentions`, `read:reports`, `read:analytics`,
`write:alerts`, `write:queries`, …) checked per request, same
authorization path as session-based requests (no separate, weaker code
path for API-key auth).

## Admin / impersonation (brief §86)

Platform Super Admin does not get implicit access to tenant application
views. Any impersonation capability (not in MVP) must be explicit,
audited, and time-limited by design before it is built — this is a hard
constraint on the eventual implementation, not a suggestion.

## Error handling (brief §69)

User-facing errors are safe, generic messages plus a request/job
identifier; technical detail (stack traces) goes to server logs/telemetry
only, never to the client in production.

## Logging (brief §134)

Structured logs carry correlation ids (`request_id`, `organization_id`,
`user_id`, `job_id`, `source_id`) and never log sensitive content
(passwords, tokens, secrets, full scraped article bodies).

## Security testing

See `TEST_STRATEGY.md` — cross-tenant/IDOR, SSRF, XSS, CSRF, SQL
injection, broken access control, file upload, rate-limit bypass, session
misuse, API key exposure, and prompt-injection-via-scraped-content are
explicit, ongoing suite items, not a one-time audit.
