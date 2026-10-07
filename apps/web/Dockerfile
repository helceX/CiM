# apps/web/Dockerfile — production image for the Next.js app.
#
# Build from the MONOREPO ROOT so the build context includes the
# workspace packages this app imports (@cim/db, @cim/ai, ...):
#
#   docker build -f apps/web/Dockerfile -t cim-web .
#
# Not build-tested in this environment (no Docker daemon available here) —
# CI's "docker-build" job (.github/workflows/ci.yml) builds this on every
# push/PR so breakage is caught before it reaches a real deploy.

FROM node:22-bookworm-slim AS base
RUN corepack enable
WORKDIR /repo

# --- deps: install once, cached as long as lockfile/package.jsons don't change ---
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/ai/package.json packages/ai/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/ingestion/package.json packages/ingestion/package.json
COPY packages/reports/package.json packages/reports/package.json
COPY packages/search/package.json packages/search/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY packages/validation/package.json packages/validation/package.json
RUN pnpm install --frozen-lockfile

# --- builder: full source + Next.js standalone build ---
FROM deps AS builder
COPY . .
# `next build` statically collects each API route's config, which imports
# @cim/db -> @cim/config's getEnv() (packages/config/src/index.ts) — it
# validates process.env eagerly, so the build fails without *some* value
# here even though nothing is actually connected to at build time. These
# never reach the runner stage (separate `FROM`, no ENV inheritance across
# stages) — real values are supplied as container runtime env vars, the
# same way CI's own "checks" job passes placeholders to `pnpm build`.
ENV SESSION_SECRET=docker-build-time-placeholder-0123456789abcdef01234567
ENV DATABASE_URL=postgres://build:build@localhost:5432/build
ENV REDIS_URL=redis://localhost:6379
RUN pnpm --filter @cim/web build

# --- runner: minimal image, only the traced standalone output ---
FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

# Picture exports (PNG, and the chart inside an Excel file) are drawn by sharp's SVG renderer, which needs a
# system font to write text with; the slim image has none.
RUN apt-get update \
  && apt-get install -y --no-install-recommends fontconfig fonts-dejavu-core \
  && rm -rf /var/lib/apt/lists/*

# next.config.ts sets outputFileTracingRoot to the monorepo root, so the
# standalone folder mirrors the monorepo layout (server entry at
# apps/web/server.js) — copy it as-is rather than flattening it.
COPY --from=builder --chown=nextjs:nodejs /repo/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /repo/apps/web/public ./apps/web/public

USER nextjs
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
