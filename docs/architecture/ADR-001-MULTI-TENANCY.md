# ADR-001: Multi-Tenancy Model

## Status
Accepted

## Context
CiM is multi-tenant SaaS (Organization → Workspace → Project). A tenant
isolation failure (one organization seeing another's mentions, queries,
reports) is the single most damaging class of bug this product can ship —
it's a trust and legal failure, not just a UX bug. We need a model that is
hard to get wrong by default, not just possible to get right if every
developer remembers.

## Decision
**Shared database, shared schema, application-enforced row-level tenancy**,
with defense-in-depth rather than a single control point:

1. **Session-derived tenant scope only.** `organization_id` used for
   authorization is resolved server-side from the authenticated
   session/membership on every request. It is never accepted from client
   input (URL param, body, header) for authorization purposes — a
   client-supplied org id, if present at all (e.g. for UX convenience),
   is validated against the session's memberships and rejected otherwise.
2. **No unscoped query path.** Every repository function in `packages/db`
   that touches a tenant-scoped table requires `organizationId` as a
   required (non-optional) parameter. There is no generic
   `findMany()`-style helper that can be called without it. Code review
   and a lint rule (custom ESLint rule or repo convention check) flag any
   new repository export that queries a tenant table without this
   parameter in its signature.
3. **Composite indexes on `(organization_id, …)`** for every tenant table's
   primary access pattern, so correct scoping is also the fast path, not
   a tax.
4. **Global/reference data is explicitly separate.** `Article`, `Source`,
   `Entity`, `Author` are shared infrastructure, not tenant-owned —
   tenant-specific meaning attaches via `Mention`, `Tag`, `SavedView`,
   never by duplicating shared rows per tenant. This keeps the dataset
   from ballooning and keeps the "what's shared vs. tenant-owned" line
   explicit in the schema itself.
5. **Automated IDOR/cross-tenant tests** for every list and detail
   endpoint: authenticate as org A, attempt to read/write org B's
   resources by id, assert rejection. This runs in CI, not just at
   initial build time (`TEST_STRATEGY.md`).
6. **Database-level protection where practical.** Postgres Row-Level
   Security is evaluated as an additional layer once the connection
   model (pooled, app-level connection reused across tenants) is settled;
   it is not the primary mechanism in MVP because the app's connection
   pooling pattern (a single service role, not per-tenant DB roles) makes
   RLS session-variable wiring an additional moving part. It's a hardening
   candidate for a later phase, not skipped permanently — noted here so
   it isn't silently forgotten.

## Alternatives considered
- **Database-per-tenant / schema-per-tenant.** Strongest isolation, but
  operationally heavy (migrations × N tenants, connection management) at
  a stage where tenant count and per-tenant data volume don't yet justify
  it. Revisit if/when a single large enterprise tenant needs dedicated
  infrastructure guarantees (e.g. contractual data-residency terms).
- **Postgres RLS as primary mechanism from day one.** Rejected for MVP
  due to added operational complexity (session variable per request,
  connection pooler compatibility) relative to the team's current scale;
  kept as an explicit future hardening layer, not ruled out.

## Consequences
- Every new tenant-scoped table and every new repository function must
  follow the required-parameter convention — this is enforced in code
  review as a hard rule, called out in `SECURITY.md`.
- Test suite cost: every new endpoint needs a corresponding cross-tenant
  negative test, not just a happy-path test.
