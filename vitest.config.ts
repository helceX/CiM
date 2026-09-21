import { defineConfig } from "vitest/config";

// Integration tests (packages/db, packages/ingestion) need DATABASE_URL /
// REDIS_URL / SESSION_SECRET. CI sets these as job-level env vars; for
// local `pnpm test`, load them from the same dev env file `pnpm db:migrate`
// already uses. process.loadEnvFile never overrides a var already set, so
// CI's explicit env always wins.
try {
  process.loadEnvFile(new URL("./packages/db/.env.local", import.meta.url));
} catch {
  // No local env file (e.g. a fresh checkout before `cp .env.example .env.local`)
  // — fine, integration tests that need it will report a clear config error.
}

export default defineConfig({
  test: {
    environment: "node",
    include: ["packages/*/src/**/*.test.ts", "apps/*/src/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/.next/**"],
  },
});
