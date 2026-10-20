import "server-only";
import {
  crawlStateKey,
  parseCrawlDiagnostic,
  parseStorageSnapshot,
  storageHistoryDays,
  storageSnapshotKey,
  type CrawlDiagnostic,
  type StorageSnapshot,
} from "@cim/core";
import { getRedis } from "./redis";

export async function getSourceDiagnostics(
  ids: string[],
): Promise<Record<string, CrawlDiagnostic | null> | null> {
  if (ids.length === 0) return {};
  try {
    const values = await getRedis().mget(...ids.map(crawlStateKey));
    if (values.length !== ids.length)
      throw new Error("Incomplete source diagnostics read");
    return Object.fromEntries(
      ids.map((id, index) => [id, parseCrawlDiagnostic(values[index] ?? null)]),
    );
  } catch (error) {
    console.error("[admin] source diagnostics unavailable:", error);
    return null;
  }
}

export async function getStorageHistory(
  now: Date = new Date(),
): Promise<StorageSnapshot[] | null> {
  try {
    const days = storageHistoryDays(now);
    const values = await getRedis().mget(...days.map(storageSnapshotKey));
    if (values.length !== days.length)
      throw new Error("Incomplete storage history read");
    const snapshots: StorageSnapshot[] = [];
    for (const [index, day] of days.entries()) {
      const raw = values[index] ?? null;
      const snapshot = parseStorageSnapshot(raw, day);
      if (raw !== null && snapshot === null)
        throw new Error("Invalid storage snapshot");
      if (snapshot) snapshots.push(snapshot);
    }
    return snapshots;
  } catch (error) {
    console.error("[admin] storage history unavailable:", error);
    return null;
  }
}
