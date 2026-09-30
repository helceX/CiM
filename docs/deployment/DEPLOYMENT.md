# Deployment

## Local development

`docker-compose.yml` (repo root) provisions: Postgres (+ pgvector
extension), Redis, Meilisearch, and a local S3-compatible store (MinIO) for
object storage. `apps/web` and `apps/worker` run via the package manager's
dev scripts against these services. `.env.example` documents every
required variable; no secret ever lives in source control.

## Environments

- **Development** — Docker Compose, mock connectors available, seed data,
  local email capture (no real email provider required to develop).
- **Staging** — mirrors production topology at smaller scale, real
  connectors behind explicit opt-in per source, synthetic tenant data only.
- **Production** — see topology below. Deployed via CI/CD (GitHub Actions)
  after all gates in `TEST_STRATEGY.md` pass.

## Topology (target, not day-one infra work)

```
            ┌────────────┐
            │   CDN/LB    │
            └─────┬──────┘
                  │
        ┌─────────┴─────────┐
        │   apps/web (Next)  │  stateless, horizontally scaled
        └─────────┬─────────┘
                  │
   ┌──────────────┼───────────────────┐
   │              │                    │
┌──▼───┐   ┌──────▼──────┐    ┌───────▼──────┐
│ Postgres │  Redis (queue│    │ Meilisearch/  │
│ (primary)│  + cache)    │    │ OpenSearch    │
└──────────┘   └──────┬──────┘    └──────────────┘
                      │
              ┌───────▼────────┐
              │ apps/worker      │  horizontally scaled,
              │ (ingestion, AI,  │  separate deploy from web
              │  alerts, reports)│
              └─────────────────┘
```

Object storage (S3-compatible) holds report exports and any permitted
stored media; it is not the source of truth for any tenant data.

## Deploy process (MVP)

1. CI runs full gate suite on the PR.
2. Merge to main triggers build + database migration (forward-only,
   reviewed migration files — see `DATA_MODEL.md`).
3. Web and worker images deploy independently; worker deploy does not
   require web downtime and vice versa (they share the DB/queue contract,
   not a process boundary).
4. Health checks gate traffic cutover; failed health check rolls back
   automatically.

## Secrets

All external service credentials (DB, Redis, Meilisearch, object storage,
email provider, AI provider keys) are injected via environment variables
from the deployment platform's secret store — never committed, never
logged. See `SECURITY.md` for the secret-handling rules that apply in code
review.

## Observability

OpenTelemetry traces/metrics from both `apps/web` and `apps/worker`;
errors reported via Sentry (or equivalent, behind an abstraction). Every
log line that can carry `request_id` / `organization_id` / `user_id` /
`job_id` / `source_id` does so, for correlation — never raw scraped
content or secrets.

## Rollback

Because migrations are forward-only and additive-first (see
`DATA_MODEL.md` migration rules), rolling back a deploy to the previous
image is safe without a matching down-migration in the common case;
destructive migrations are scheduled separately after the code that stops
depending on the old shape is fully rolled out.
