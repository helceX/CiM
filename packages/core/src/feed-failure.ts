/**
 * Why a catalog feed could not be added, in a few classes — and which of those are worth trying again.
 *
 * The background import (apps/worker/src/jobs/import-catalog.ts) fetch-tests every candidate and used to record only the
 * message, retry every failure once after three days, and say nothing about causes. A batch where everything "fails" is
 * usually not 25 dead feeds: it is a timeout storm (the worker's event loop was busy), one publisher rate-limiting a
 * batch of its own 265 category feeds, or the network. Those are transient and say nothing about the feed.
 */
export type FeedFailureClass =
  | "timeout"
  | "network"
  | "rate_limited"
  | "server_error"
  | "blocked"
  | "not_found"
  | "not_a_feed"
  | "empty"
  | "policy"
  | "other";

export const FEED_FAILURE_LABELS: Record<FeedFailureClass, string> = {
  timeout: "Timed out",
  network: "Network or TLS error",
  rate_limited: "Rate limited (HTTP 429)",
  server_error: "Publisher server error (HTTP 5xx)",
  blocked: "Refused (HTTP 401/403)",
  not_found: "Not found (HTTP 404/410)",
  not_a_feed: "Not a readable feed",
  empty: "Feed has no items",
  policy: "Not allowed (robots.txt / address policy)",
  other: "Other",
};

/** Classes that say something about the moment, not about the feed. */
const TRANSIENT: ReadonlySet<FeedFailureClass> = new Set(["timeout", "network", "rate_limited", "server_error"]);

export function isTransientFeedFailure(failure: FeedFailureClass): boolean {
  return TRANSIENT.has(failure);
}

/** Reads the message the fetch test / feed discovery recorded (see ingestion source-test.ts, feed-discovery.ts). */
export function classifyFeedFailure(message: string | null | undefined): FeedFailureClass {
  const text = message ?? "";
  const status = /HTTP (\d{3})/.exec(text)?.[1];
  if (status) {
    const code = Number(status);
    if (code === 429) return "rate_limited";
    if (code === 408) return "timeout";
    if (code >= 500) return "server_error";
    if (code === 401 || code === 403) return "blocked";
    if (code === 404 || code === 410) return "not_found";
    return "other";
  }
  if (/no items/i.test(text)) return "empty";
  if (/unrecognized feed format|no readable feed|not well-formed|invalid xml/i.test(text)) return "not_a_feed";
  if (/robots\.txt|not allowed|not a web address/i.test(text)) return "policy";
  if (/timeout|timed out|aborted|ETIMEDOUT/i.test(text)) return "timeout";
  if (/fetch failed|ECONN|ENOTFOUND|EAI_AGAIN|EPIPE|socket|certificate|CERT_|getaddrinfo|network|UND_ERR|EHOSTUNREACH|ENETUNREACH/i.test(text)) return "network";
  return "other";
}

export type ImportAttempt = { status: string; attempts: number; attemptedAt: Date; error: string | null };

const DAY_MS = 86_400_000;
/** A feed that is gone or not a feed: tried twice, three days apart. */
export const PERMANENT_MAX_ATTEMPTS = 2;
export const PERMANENT_RETRY_AFTER_MS = 3 * DAY_MS;
/** A feed that failed for a reason of the moment: tried again after a day, up to five times. */
export const TRANSIENT_MAX_ATTEMPTS = 5;
export const TRANSIENT_RETRY_AFTER_MS = 1 * DAY_MS;

/** Whether the import should look at this feed again (anything not recorded yet is eligible without asking this). */
export function importRetryEligible(attempt: ImportAttempt, now: Date): boolean {
  if (attempt.status !== "failed") return false;
  const transient = isTransientFeedFailure(classifyFeedFailure(attempt.error));
  const maxAttempts = transient ? TRANSIENT_MAX_ATTEMPTS : PERMANENT_MAX_ATTEMPTS;
  const wait = transient ? TRANSIENT_RETRY_AFTER_MS : PERMANENT_RETRY_AFTER_MS;
  return attempt.attempts < maxAttempts && now.getTime() - attempt.attemptedAt.getTime() >= wait;
}

/** At most `perHost` candidates of one host per batch, in catalog order — a publisher with 265 category feeds is not asked for them all at once. */
export function spreadByHost<T extends { url: string }>(candidates: readonly T[], limit: number, perHost: number): T[] {
  const taken = new Map<string, number>();
  const picked: T[] = [];
  for (const candidate of candidates) {
    if (picked.length >= limit) break;
    let host = candidate.url;
    try {
      host = new URL(candidate.url).host;
    } catch {
      // an invalid address is its own "host"; the fetch test will reject it
    }
    const count = taken.get(host) ?? 0;
    if (count >= perHost) continue;
    taken.set(host, count + 1);
    picked.push(candidate);
  }
  return picked;
}

export type FailureTally = { total: number; byClass: Partial<Record<FeedFailureClass, number>>; hosts: number };

export function tallyFailures(failures: readonly { url: string; message: string }[]): FailureTally {
  const byClass: Partial<Record<FeedFailureClass, number>> = {};
  const hosts = new Set<string>();
  for (const failure of failures) {
    const failureClass = classifyFeedFailure(failure.message);
    byClass[failureClass] = (byClass[failureClass] ?? 0) + 1;
    try {
      hosts.add(new URL(failure.url).host);
    } catch {
      hosts.add(failure.url);
    }
  }
  return { total: failures.length, byClass, hosts: hosts.size };
}

/**
 * A batch where nearly everything failed for a reason of the moment, across many publishers, points at us (a busy
 * worker, a network problem), not at the feeds. Those failures are not held against the feeds.
 */
export function looksLikeLocalFault(tally: FailureTally, added: number): boolean {
  if (added > 0 || tally.total < 10 || tally.hosts < 5) return false;
  const transient = (Object.entries(tally.byClass) as [FeedFailureClass, number][])
    .filter(([failureClass]) => isTransientFeedFailure(failureClass))
    .reduce((sum, [, count]) => sum + count, 0);
  return transient / tally.total >= 0.8;
}

/** "timeout 20, refused 3" for a log line or a note. */
export function describeTally(tally: FailureTally): string {
  return (Object.entries(tally.byClass) as [FeedFailureClass, number][])
    .sort((a, b) => b[1] - a[1])
    .map(([failureClass, count]) => `${failureClass} ${count}`)
    .join(", ");
}
