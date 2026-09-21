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

export function clientIpFrom(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  return forwardedFor?.split(",")[0]?.trim() ?? "unknown";
}
