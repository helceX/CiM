# apps/worker/Dockerfile — production image for the BullMQ worker.
#
# Build from the MONOREPO ROOT so the build context includes the
# workspace packages this app imports (@cim/db, @cim/ai, ...):
#
#   docker build -f apps/worker/Dockerfile -t cim-worker .
#
# Not build-tested in this environment (no Docker daemon available here) —
# CI's "docker-build" job (.github/workflows/ci.yml) builds this on every
# push/PR so breakage is caught before it reaches a real deploy.
#
# Unlike apps/web, this can't use a trimmed/traced output: every workspace
# package (@cim/db, @cim/ai, ...) ships raw TypeScript as its `main` (no
# build step — see packages/*/package.json), resolved at runtime via
# Node's native TS support (confirmed on Node 22.22, not guaranteed on
# every base image) rather than a compiled dist/. So the runner stage
# copies the whole built monorepo rather than a pruned subset.
#
# Runs src/index.ts directly through tsx's own binary (same as the "dev"
# script, minus --watch) rather than `node dist/index.js` —
# tsconfig.base.json sets moduleResolution: "Bundler" for the whole
# monorepo (apps/web's imports go through Next's own bundler; every other
# package is consumed as raw .ts, never as compiled output), so
# apps/worker/src's extensionless relative imports (e.g. `from "./redis"`)
# compile fine but are NOT valid specifiers under Node's own strict ESM
# resolution — `node dist/index.js` throws ERR_MODULE_NOT_FOUND on the
# first one it hits. `pnpm build`/tsc still runs below as a real
# type-check gate; its dist/ output just isn't the thing that gets
# executed.
#
# CMD calls the tsx binary directly (not via `pnpm run`/`pnpm exec`):
# pnpm's own invocation goes through corepack first to verify the pinned
# package-manager version, which needs to write to a cache under $HOME —
# the non-root `worker` user below has no real home directory
# (`adduser --system` sets HOME=/nonexistent), so that write fails with
# EACCES the moment the container starts. Going straight to tsx's binary
# skips corepack — and pnpm — entirely at runtime.

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

# --- builder: full source, tsc build, and the Chromium binary reports need ---
FROM deps AS builder
COPY . .
RUN pnpm --filter @cim/worker build
# packages/reports (render-pdf.ts) launches headless Chromium for report
# PDFs — install the exact browser build Playwright's pinned version
# expects, plus the OS-level libs it needs (fonts, codecs, etc.), into a
# fixed path so it survives into the runner stage below.
ENV PLAYWRIGHT_BROWSERS_PATH=/repo/.playwright-browsers
RUN pnpm --filter @cim/reports exec playwright install --with-deps chromium

# --- runner: whole built monorepo (see note above on why) ---
FROM node:22-bookworm-slim AS runner
WORKDIR /repo
ENV NODE_ENV=production
ENV PLAYWRIGHT_BROWSERS_PATH=/repo/.playwright-browsers

RUN addgroup --system --gid 1001 worker \
  && adduser --system --uid 1001 worker

COPY --from=builder --chown=worker:worker /repo ./

# `playwright install --with-deps` above ran in the BUILDER stage, so the browser binary was copied
# into this image but the system libraries it loads (NSS, GTK/ATK, fonts, ...) were not — report
# PDFs failed with "error while loading shared libraries". Install them here, as root, in the
# image that actually runs the worker.
RUN node packages/reports/node_modules/playwright/cli.js install-deps chromium \
  && rm -rf /var/lib/apt/lists/*

USER worker
CMD ["apps/worker/node_modules/.bin/tsx", "apps/worker/src/index.ts"]
