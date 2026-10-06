/** `CRAWL_CONCURRENCY` (worker env, 1–40) sets how many feeds are fetched at once; thousands of sources need more than a handful. */
export function crawlConcurrency(env: Record<string, string | undefined>): number {
  const value = Number(env.CRAWL_CONCURRENCY);
  return Number.isInteger(value) && value >= 1 && value <= 40 ? value : 15;
}
