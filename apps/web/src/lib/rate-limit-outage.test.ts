import { afterEach, describe, expect, it, vi } from "vitest";
import { checkRateLimit } from "./rate-limit";

vi.mock("./redis", () => ({
  getRedis: () => {
    throw new Error("Redis unavailable");
  },
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("rate limiting during a Redis outage", () => {
  it("blocks abuse-prone requests in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await checkRateLimit("outage", { limit: 5, windowSeconds: 30 })).toEqual({
      allowed: false,
      remaining: 0,
    });
  });

  it("allows local development without Redis", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await checkRateLimit("outage", { limit: 5, windowSeconds: 30 })).toEqual({
      allowed: true,
      remaining: 5,
    });
  });
});
