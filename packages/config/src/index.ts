import { z } from "zod";

/**
 * Every external service this app depends on is configured through
 * environment variables, validated once at process start (see
 * docs/architecture/SECURITY.md — secrets never live in source).
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.url().default("http://localhost:3000"),
  SESSION_SECRET: z
    .string()
    .min(32, "SESSION_SECRET must be at least 32 characters"),

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

  AI_PROVIDER: z.enum(["disabled", "anthropic", "openai"]).default("disabled"),
  AI_API_KEY: z.string().optional(),

  DEFAULT_TIMEZONE: z.string().default("Europe/Istanbul"),
  DEFAULT_LOCALE: z.enum(["tr", "en"]).default("tr"),
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
