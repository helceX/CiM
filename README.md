# CiM — Communication Intelligence Platform

A multi-tenant media/communication intelligence SaaS for corporate
communications, PR, and brand teams. See `docs/product/PRODUCT_VISION.md`
for the product brief and `docs/architecture/ARCHITECTURE.md` for the
system design.

## Documentation

- Product: `docs/product/` (vision, user flows, feature matrix)
- Architecture: `docs/architecture/` (system design, data model, ADRs)
- UX: `docs/ux/` (design system, information architecture, screen inventory)
- Testing: `docs/testing/TEST_STRATEGY.md`
- Deployment: `docs/deployment/DEPLOYMENT.md`

## Project layout

```
apps/
  web/       Next.js app — public site, authenticated app, API routes
  worker/    BullMQ job consumers (email delivery today; ingestion/AI/
             report jobs land here as those pipelines ship)
packages/
  ui/        Design-system components (tokens + Radix-based primitives)
  db/        Drizzle schema, migrations, repositories, seed data
  core/      Domain logic: authz, password hashing, query AST, jobs
  config/    Env loading/validation (Zod)
  validation/ Shared Zod schemas (auth, onboarding)
```

## Prerequisites

- Node.js >= 22.12
- pnpm 10.x
- PostgreSQL 16+ and Redis, reachable locally (see below)

## Local setup

1. Install dependencies:
   ```
   pnpm install
   ```
2. Start Postgres and Redis. `docker-compose.yml` provisions both (plus
   Meilisearch and MinIO for later phases) if you have Docker available:
   ```
   docker compose up -d postgres redis
   ```
   Without Docker, point `DATABASE_URL`/`REDIS_URL` at any local Postgres
   16+ / Redis instance instead.
3. Copy `.env.example` to `.env.local` in `apps/web/`, `apps/worker/`, and
   `packages/db/`, filling in `DATABASE_URL`, `REDIS_URL`, and a random
   `SESSION_SECRET` (32+ characters) at minimum.
4. Generate and apply the database schema:
   ```
   pnpm db:generate
   pnpm db:migrate
   ```
5. Optional: load synthetic demo data (brief-compliant fake data, never
   real coverage) so the dashboard has something to show immediately:
   ```
   pnpm db:seed
   ```
   Seeds a demo organization with the login `demo-owner@northwind.example`
   / `DemoPassw0rd!`.
6. Run the app and worker:
   ```
   pnpm dev          # apps/web on http://localhost:3000
   pnpm dev:worker   # apps/worker (email delivery jobs)
   ```

## Testing

```
pnpm typecheck   # all packages
pnpm lint        # ESLint (flat config)
pnpm test        # Vitest unit tests
pnpm test:e2e    # Playwright — requires a running dev server + database
```

`EMAIL_PROVIDER=console` (the default) writes outgoing emails to the
`email_outbox` table instead of a real provider, so registration/password
flows are fully testable without a mail service — see
`docs/testing/TEST_STRATEGY.md`.
