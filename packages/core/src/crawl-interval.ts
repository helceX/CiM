/**
 * How often one source may be fetched. The scheduler ticks every 30 s, but a
 * public site must never be polled that often: each crawl makes two requests
 * (health check + fetch), which at a 30 s cadence is ~5,700 requests a day per
 * feed — enough to get our IP blocked or draw a complaint. Real feeds are
 * polled every eight hours to reduce repeated fetches and ingestion work.
 * Feed windows can be short: this cadence trades freshness and potentially
 * coverage for cost, and is not a guarantee of complete publisher history.
 */
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

const CRAWL_INTERVAL_MS: Record<string, number> = {
  rss: 8 * HOUR,
  "google-trends": 8 * HOUR,
  api: 8 * HOUR,
  sitemap: 8 * HOUR,
  web: 8 * HOUR,
  // Synthetic dev/demo connectors make no network requests.
  mock: 25_000, // a bit under the 30 s tick so it stays due on every tick
  "mock-social": 25_000,
};

/** Anything unrecognised is treated like a real site, never like a mock. */
const DEFAULT_CRAWL_INTERVAL_MS = 8 * HOUR;

/** Production checks for due sources every five minutes; keep synthetic demos responsive. */
export function crawlSchedulerIntervalMs(environment: string | undefined): number {
  return environment === "production" ? 5 * MINUTE : 30_000;
}

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
