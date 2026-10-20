import { FEED_FAILURE_LABELS, type FeedFailureClass } from "./feed-failure";

export const crawlStateKey = (sourceId: string) => `crawl:state:${sourceId}`;
export type CrawlFailure = {
  category: FeedFailureClass;
  checkedAt: number;
  stage: "health" | "ingestion";
};
export type CrawlDiagnostic = CrawlFailure & {
  failures: number;
  nextAt: number | null;
};

/** Old, expired or malformed memory is unknown, never a guessed cause. */
export function parseCrawlDiagnostic(raw: string | null): CrawlDiagnostic | null {
  try {
    const value = JSON.parse(raw ?? "null");
    const failure = value?.failure;
    if (
      !failure ||
      !Object.hasOwn(FEED_FAILURE_LABELS, failure.category) ||
      !Number.isSafeInteger(failure.checkedAt) ||
      failure.checkedAt <= 0 ||
      failure.checkedAt > 8_640_000_000_000_000 ||
      !["health", "ingestion"].includes(failure.stage) ||
      !Number.isSafeInteger(value.failures) ||
      value.failures < 1 ||
      (value.nextAt != null &&
        (!Number.isSafeInteger(value.nextAt) ||
          value.nextAt <= 0 ||
          value.nextAt > 8_640_000_000_000_000))
    )
      return null;
    return {
      category: failure.category,
      stage: failure.stage,
      checkedAt: failure.checkedAt,
      failures: value.failures,
      nextAt: value.nextAt ?? null,
    };
  } catch {
    return null;
  }
}

export const STORAGE_HISTORY_DAYS = 60;
export const STORAGE_HISTORY_TTL_SECONDS = STORAGE_HISTORY_DAYS * 86_400;
export type StorageSnapshot = { at: string; bytes: number };
export const storageSnapshotKey = (day: string) => `platform:storage:${day}`;

export function parseStorageSnapshot(
  raw: string | null,
  day: string,
): StorageSnapshot | null {
  try {
    const value = JSON.parse(raw ?? "null");
    if (
      typeof value?.at !== "string" ||
      !Number.isFinite(Date.parse(value.at)) ||
      new Date(value.at).toISOString().slice(0, 10) !== day ||
      !Number.isSafeInteger(value.bytes) ||
      value.bytes < 0
    )
      return null;
    return { at: value.at, bytes: value.bytes };
  } catch {
    return null;
  }
}

export function storageHistoryDays(now: Date): string[] {
  const midnight = Date.parse(`${now.toISOString().slice(0, 10)}T00:00:00Z`);
  return Array.from({ length: STORAGE_HISTORY_DAYS }, (_, i) =>
    new Date(midnight - (STORAGE_HISTORY_DAYS - 1 - i) * 86_400_000)
      .toISOString()
      .slice(0, 10),
  );
}
