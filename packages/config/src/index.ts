import { z } from "zod";

/**
 * Every external service this app depends on is configured through
 * environment variables, validated once at process start (see
 * docs/architecture/SECURITY.md — secrets never live in source).
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.url().default("http://localhost:3000"),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),

  DATABASE_URL: z.url(),

  REDIS_URL: z.url(),

  MEILISEARCH_URL: z.url().optional(),
  MEILISEARCH_API_KEY: z.string().optional(),

  S3_ENDPOINT: z.url().optional(),
  S3_REGION: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),

  EMAIL_PROVIDER: z.enum(["console", "resend", "ses"]).default("console"),
  EMAIL_FROM: z.string().default("CiM <no-reply@cim.example>"),
  EMAIL_API_KEY: z.string().optional(),

  // "disabled": no enrichment, AI fields stay "Not available" (brief §92).
  // "mock": deterministic heuristic provider, no API key needed (dev/demo
  // default — see packages/ai/src/mock-provider.ts). "openai" is reserved,
  // not yet implemented — treated the same as "disabled" until it is.
  AI_PROVIDER: z.enum(["disabled", "mock", "anthropic", "openai"]).default("disabled"),
  AI_API_KEY: z.string().optional(),
  AI_CHEAP_MODEL: z.string().default("claude-haiku-4-5"),
  AI_SYNTHESIS_MODEL: z.string().default("claude-sonnet-5"),

  DEFAULT_TIMEZONE: z.string().default("Europe/Istanbul"),
  DEFAULT_LOCALE: z.enum(["tr", "en"]).default("tr"),

  // Optional override for where Playwright's Chromium binary lives
  // (packages/reports PDF rendering). Unset lets Playwright resolve it
  // the normal way; some environments pin a specific revision path.
  PLAYWRIGHT_CHROMIUM_PATH: z.string().optional(),
}).check((ctx) => {
  // getAIProvider (packages/ai) throws synchronously when AI_PROVIDER is
  // "anthropic" without AI_API_KEY — most callers (apps/web/src/app/api/
  // monitoring/preview, .../assistant/ask) don't wrap that call in
  // try/catch, since it's meant to be a startup-time misconfiguration,
  // not a per-request failure mode. Catching it here means every process
  // fails loudly at boot instead of only the first request that happens
  // to touch an AI-backed route.
  if (ctx.value.AI_PROVIDER === "anthropic" && !ctx.value.AI_API_KEY) {
    ctx.issues.push({
      code: "custom",
      message: "AI_API_KEY is required when AI_PROVIDER is \"anthropic\"",
      path: ["AI_API_KEY"],
      input: ctx.value.AI_API_KEY,
    });
  }
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

/**
 * Lazily validated so importing this module never throws at bundle time —
 * only when config is actually read (server-side only, never in a client
 * bundle).
 */
export function getEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** Test-only escape hatch to reset the cache between test cases. */
export function __resetEnvCacheForTests(): void {
  cached = undefined;
}
