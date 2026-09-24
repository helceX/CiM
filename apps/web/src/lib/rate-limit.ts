import "server-only";
import { getRedis } from "./redis";

/**
 * Fixed-window rate limit backed by Redis (brief §76). Applied to
 * unauthenticated, abuse-prone endpoints: register, login, password
 * reset request. Fails open only on Redis being unreachable in dev — in
 * production a broken rate limiter should not be the reason auth is
 * fully down, but the failure is logged loudly so it's noticed.
 */
export async function checkRateLimit(
  key: string,
  options: { limit: number; windowSeconds: number },
): Promise<{ allowed: boolean; remaining: number }> {
  try {
    const redis = getRedis();
    const redisKey = `ratelimit:${key}`;
    const count = await redis.incr(redisKey);
    if (count === 1) {
      await redis.expire(redisKey, options.windowSeconds);
    }
    return { allowed: count <= options.limit, remaining: Math.max(0, options.limit - count) };
  } catch (error) {
    console.error("Rate limiter unavailable, failing open:", error);
    return { allowed: true, remaining: options.limit };
  }
}

/**
 * docs/deployment/DEPLOYMENT.md's topology puts exactly one trusted hop
 * (the CDN/LB) directly in front of apps/web — that hop appends the
 * connecting IP it actually saw to the *end* of X-Forwarded-For, so the
 * last entry is the one hop nothing upstream of it could have forged.
 * The first entry is whatever the original request already carried,
 * which any raw HTTP client controls — trusting it (the previous
 * behavior here) let an attacker rotate X-Forwarded-For per request to
 * get a fresh rate-limit bucket every time on login/register/password
 * reset, defeating the whole point of rate-limiting those endpoints.
 */
export function clientIpFrom(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (!forwardedFor) return "unknown";
  const hops = forwardedFor.split(",").map((hop) => hop.trim());
  return hops[hops.length - 1] || "unknown";
}
