/**
 * How often one source may be fetched. The scheduler ticks every 30 s, but a
 * public site must never be polled that often: each crawl makes two requests
 * (health check + fetch), which at a 30 s cadence is ~5,700 requests a day per
 * feed — enough to get our IP blocked or draw a complaint. Real feeds are
 * polled every two hours: with hundreds of feeds that is a quiet, polite load
 * on each publisher, and still fresh enough for media monitoring (a story is
 * seen within two hours of being published).
 */
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

const CRAWL_INTERVAL_MS: Record<string, number> = {
  rss: 2 * HOUR,
  "google-trends": 15 * MINUTE,
  api: 2 * HOUR,
  sitemap: 2 * HOUR,
  web: 2 * HOUR,
  // Synthetic dev/demo connectors make no network requests.
  mock: 25_000, // a bit under the 30 s tick so it stays due on every tick
  "mock-social": 25_000,
};

/** Anything unrecognised is treated like a real site, never like a mock. */
const DEFAULT_CRAWL_INTERVAL_MS = 2 * HOUR;

export function crawlIntervalMs(connector: string): number {
  return CRAWL_INTERVAL_MS[connector] ?? DEFAULT_CRAWL_INTERVAL_MS;
}

/** The same table for a database query that selects the due sources instead of reading them all (db/sources.ts listDueSources). */
export function crawlIntervalTable(): { byConnector: Readonly<Record<string, number>>; fallbackMs: number } {
  return { byConnector: CRAWL_INTERVAL_MS, fallbackMs: DEFAULT_CRAWL_INTERVAL_MS };
}

/** A never-checked source is always due; otherwise due once its interval has passed. */
export function isSourceDue(
  source: { connector: string; lastCheckedAt: Date | null },
  now: Date = new Date(),
): boolean {
  if (!source.lastCheckedAt) return true;
  return now.getTime() - source.lastCheckedAt.getTime() >= crawlIntervalMs(source.connector);
}
