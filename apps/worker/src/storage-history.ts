import Redis from "ioredis";
import { getEnv } from "@cim/config";
import { db, getDatabaseSizeBytes } from "@cim/db";
import { storageSnapshotKey, STORAGE_HISTORY_TTL_SECONDS } from "@cim/core";

/** One first successful measurement per UTC day. Monitoring must not block billing. */
export async function captureStorageSnapshot(now: Date = new Date()): Promise<void> {
  let redis: Redis | undefined;
  try {
    const bytes = await getDatabaseSizeBytes(db);
    if (!Number.isSafeInteger(bytes) || bytes < 0)
      throw new Error("Invalid database size");
    // A short-lived bounded client: BullMQ's blocking client retries forever,
    // which would stall the daily usage/metering pass during a Redis outage.
    redis = new Redis(getEnv().REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      connectTimeout: 5_000,
      commandTimeout: 5_000,
      retryStrategy: () => null,
    });
    redis.on("error", () => {}); // Report once through the catch below.
    await redis.connect();
    await redis.set(
      storageSnapshotKey(now.toISOString().slice(0, 10)),
      JSON.stringify({ at: now.toISOString(), bytes }),
      "EX",
      STORAGE_HISTORY_TTL_SECONDS,
      "NX",
    );
  } catch (error) {
    console.error("[worker] storage snapshot unavailable:", error);
  } finally {
    redis?.disconnect();
  }
}
