/**
 * How long a source that keeps failing is left alone, and how a publisher's own "come back later" is read.
 *
 * A source is fetched every two hours (crawl-interval.ts). One that is down for a day used to be asked again at every one
 * of those cycles — twelve requests to a dead address, each with a health check, a database round trip and a log line.
 * After the second failure in a row the wait doubles (4 h, 8 h, 16 h) up to a day, and a success starts over; the
 * first failure is not penalised, since a feed that hiccups once is the common case.
 */
const HOUR = 3_600_000;
export const CRAWL_BACKOFF_CAP_MS = 24 * HOUR;

/** Milliseconds to wait after the `failures`-th failure in a row before fetching again (never less than the normal interval). */
export function crawlBackoffMs(failures: number, intervalMs: number, retryAfterMs?: number | null): number {
  const doubling = failures <= 1 ? intervalMs : intervalMs * 2 ** (failures - 1);
  const wanted = Math.max(doubling, retryAfterMs && retryAfterMs > 0 ? retryAfterMs : 0);
  return Math.min(wanted, CRAWL_BACKOFF_CAP_MS);
}

/** The `Retry-After` header: seconds, or an HTTP date. Null when absent or unreadable. */
export function parseRetryAfter(value: string | null | undefined, now: Date = new Date()): number | null {
  const text = value?.trim();
  if (!text) return null;
  if (/^\d+$/.test(text)) return Number(text) * 1000;
  const at = Date.parse(text);
  return Number.isNaN(at) ? null : Math.max(0, at - now.getTime());
}
