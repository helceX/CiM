import { afterEach, describe, expect, it } from "vitest";
import { __resetEnvCacheForTests, getEnv } from "./index";

/**
 * Regression coverage for AI_PROVIDER=anthropic requiring AI_API_KEY —
 * previously this wasn't cross-validated here at all, so a misconfigured
 * process didn't fail until the first request happened to call
 * getAIProvider (packages/ai), which throws synchronously and crashes
 * whichever route hit it first (most callers, e.g. apps/web/src/app/api/
 * monitoring/preview, don't wrap that call in try/catch — it's meant to
 * be a startup-time misconfiguration, not a per-request failure).
 * Catching it in the schema means every process fails loudly at the
 * first getEnv() call (effectively process start), consistently.
 */
const REQUIRED_BASE_ENV = {
  SESSION_SECRET: "a".repeat(32),
  DATABASE_URL: "postgres://localhost:5432/test",
  REDIS_URL: "redis://localhost:6379",
};

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  __resetEnvCacheForTests();
});

describe("getEnv — AI_PROVIDER/AI_API_KEY cross-validation", () => {
  it("throws when AI_PROVIDER is anthropic and AI_API_KEY is unset", () => {
    process.env = { ...originalEnv, ...REQUIRED_BASE_ENV, AI_PROVIDER: "anthropic" };
    delete process.env.AI_API_KEY;

    expect(() => getEnv()).toThrow(/AI_API_KEY/);
  });

  it("does not throw when AI_PROVIDER is anthropic and AI_API_KEY is set", () => {
    process.env = {
      ...originalEnv,
      ...REQUIRED_BASE_ENV,
      AI_PROVIDER: "anthropic",
      AI_API_KEY: "sk-test-key",
    };

    expect(() => getEnv()).not.toThrow();
  });

  it("does not throw when AI_PROVIDER is left at its default (disabled)", () => {
    process.env = { ...originalEnv, ...REQUIRED_BASE_ENV };
    delete process.env.AI_PROVIDER;
    delete process.env.AI_API_KEY;

    expect(() => getEnv()).not.toThrow();
  });
});
