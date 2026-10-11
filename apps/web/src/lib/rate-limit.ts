import "server-only";
import { getRedis } from "./redis";

/**
 * Fixed-window rate limit backed by Redis (brief §76). Applied to
 * unauthenticated, abuse-prone endpoints: register, login, password
 * reset request. Production fails closed when Redis is unreachable;
 * development can continue without the limiter.
 */
export async function checkRateLimit(
  key: string,
  options: { limit: number; windowSeconds: number },
): Promise<{ allowed: boolean; remaining: number }> {
  try {
    const redis = getRedis();
    const redisKey = `ratelimit:${key}`;
    // Count + expiry are atomic. Also repair legacy counters whose expiry
    // was lost between INCR and EXPIRE during a connection failure.
    const count = Number(
      await redis.eval(
        "local n = redis.call('INCR', KEYS[1]); if n == 1 or redis.call('TTL', KEYS[1]) < 0 then redis.call('EXPIRE', KEYS[1], ARGV[1]); end; return n",
        1,
        redisKey,
        options.windowSeconds,
      ),
    );
    return {
      allowed: count <= options.limit,
      remaining: Math.max(0, options.limit - count),
    };
  } catch (error) {
    const allowed = process.env.NODE_ENV !== "production";
    console.error(
      `Rate limiter unavailable, failing ${allowed ? "open in development" : "closed"}:`,
      error,
    );
    return { allowed, remaining: allowed ? options.limit : 0 };
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
