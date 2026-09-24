import { describe, expect, it } from "vitest";
import { checkRateLimit, clientIpFrom } from "./rate-limit";

/**
 * docs/testing/TEST_STRATEGY.md security suite — "rate limiting on
 * login/register/reset" is an explicit, named item. Real Redis (the
 * integration tier), not a mock — a fixed-window counter is exactly the
 * kind of logic that looks right and races in practice.
 */
describe("checkRateLimit (integration)", () => {
  it("allows requests under the limit and reports remaining budget accurately", async () => {
    const key = `test-${crypto.randomUUID()}`;
    const first = await checkRateLimit(key, { limit: 3, windowSeconds: 30 });
    expect(first).toEqual({ allowed: true, remaining: 2 });
    const second = await checkRateLimit(key, { limit: 3, windowSeconds: 30 });
    expect(second).toEqual({ allowed: true, remaining: 1 });
  });

  it("blocks once the limit is exceeded within the window", async () => {
    const key = `test-${crypto.randomUUID()}`;
    for (let i = 0; i < 3; i += 1) {
      expect((await checkRateLimit(key, { limit: 3, windowSeconds: 30 })).allowed).toBe(true);
    }
    const blocked = await checkRateLimit(key, { limit: 3, windowSeconds: 30 });
    expect(blocked).toEqual({ allowed: false, remaining: 0 });
  });

  it("resets after the window expires, never staying locked out permanently", async () => {
    const key = `test-${crypto.randomUUID()}`;
    await checkRateLimit(key, { limit: 1, windowSeconds: 1 });
    expect((await checkRateLimit(key, { limit: 1, windowSeconds: 1 })).allowed).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 1100));

    expect((await checkRateLimit(key, { limit: 1, windowSeconds: 1 })).allowed).toBe(true);
  });

  it("tracks independent keys independently — one caller's abuse never blocks another's", async () => {
    const keyA = `test-${crypto.randomUUID()}`;
    const keyB = `test-${crypto.randomUUID()}`;
    await checkRateLimit(keyA, { limit: 1, windowSeconds: 30 });
    expect((await checkRateLimit(keyA, { limit: 1, windowSeconds: 30 })).allowed).toBe(false);
    expect((await checkRateLimit(keyB, { limit: 1, windowSeconds: 30 })).allowed).toBe(true);
  });
});

describe("clientIpFrom", () => {
  it("takes the last hop from X-Forwarded-For, trimmed — the one the trusted CDN/LB appended", () => {
    // docs/deployment/DEPLOYMENT.md: exactly one trusted proxy (CDN/LB)
    // sits in front of apps/web. That hop appends the connecting IP it
    // actually saw to the *end* of the header; everything before it is
    // whatever the client itself already sent, which is attacker-
    // controlled — trusting the first hop instead let an attacker rotate
    // X-Forwarded-For per request to dodge rate limiting entirely.
    const request = new Request("https://example.test", {
      headers: { "x-forwarded-for": " 203.0.113.5 , 10.0.0.1 " },
    });
    expect(clientIpFrom(request)).toBe("10.0.0.1");
  });

  it("returns the only hop when there's no proxy chain to spoof", () => {
    const request = new Request("https://example.test", {
      headers: { "x-forwarded-for": "203.0.113.5" },
    });
    expect(clientIpFrom(request)).toBe("203.0.113.5");
  });

  it("falls back to 'unknown' rather than throwing when the header is absent", () => {
    const request = new Request("https://example.test");
    expect(clientIpFrom(request)).toBe("unknown");
  });
});
