import "server-only";
import {
  checkDatabaseHealth,
  countOpenTakedownRequests,
  countSourcesByStatus,
  db,
  getDatabaseSizeBytes,
  getPlatformTotals,
  listLargestTables,
  listOrganizationsForAdmin,
  listSourceHealthSample,
} from "@cim/db";
import { getQueueHealth } from "./admin-queues";
import { getRedis } from "./redis";

/** A failed measurement is unknown, never an empty collection or a zero. */
async function read<T>(name: string, query: () => Promise<T>): Promise<T | null> {
  try {
    return await query();
  } catch (error) {
    console.error(`[admin] ${name} failed:`, error);
    return null;
  }
}

// Read-only platform aggregates. Call only after requireSuperAdmin(). Each
// measurement fails independently so an outage still leaves a useful overview.
export async function loadAdminOverview() {
  const [totals, dbHealthy, redisPong, queues, organizations, sources, statusCounts,
    openTakedowns, dbSizeBytes, largestTables] = await Promise.all([
    read("getPlatformTotals", () => getPlatformTotals(db)),
    read("checkDatabaseHealth", () => checkDatabaseHealth(db)),
    read("Redis ping", () => getRedis().ping()),
    read("getQueueHealth", () => getQueueHealth()),
    read("listOrganizationsForAdmin", () => listOrganizationsForAdmin(db)),
    read("listSourceHealthSample", () => listSourceHealthSample(db, 200)),
    read("countSourcesByStatus", () => countSourcesByStatus(db)),
    read("countOpenTakedownRequests", () => countOpenTakedownRequests(db)),
    read("getDatabaseSizeBytes", () => getDatabaseSizeBytes(db)),
    read("listLargestTables", () => listLargestTables(db, 6)),
  ]);
  return {
    totals, dbHealthy: dbHealthy === true, redisHealthy: redisPong === "PONG",
    queues, organizations, sources, statusCounts, openTakedowns,
    dbSizeBytes, largestTables, checkedAt: new Date(),
  };
}
