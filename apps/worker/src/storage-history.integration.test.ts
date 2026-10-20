import { expect, it } from "vitest";
import Redis from "ioredis";
import { getEnv } from "@cim/config";
import { storageSnapshotKey } from "@cim/core";
import { captureStorageSnapshot } from "./storage-history";

it("retains the first actual measurement across same-day retries and restarts (real Redis/Postgres)", async () => {
  const redis = new Redis(getEnv().REDIS_URL);
  const day = "2000-01-02"; // isolated fixture, never today's operational measurement
  const key = storageSnapshotKey(day);
  try {
    await redis.del(key);
    await captureStorageSnapshot(new Date(`${day}T08:45:00Z`));
    const first = await redis.get(key);
    expect(first).not.toBeNull();
    expect(JSON.parse(first!).bytes).toBeGreaterThan(0);
    await captureStorageSnapshot(new Date(`${day}T12:00:00Z`));
    expect(await redis.get(key)).toBe(first);
    const ttl = await redis.ttl(key);
    expect(ttl).toBeGreaterThan(59 * 86_400);
    expect(ttl).toBeLessThanOrEqual(60 * 86_400);
  } finally {
    await redis.del(key);
    await redis.quit();
  }
});
