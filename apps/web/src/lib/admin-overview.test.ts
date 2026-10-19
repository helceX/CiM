import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const queries = vi.hoisted(() => ({
  getPlatformTotals: vi.fn(), checkDatabaseHealth: vi.fn(),
  countOpenTakedownRequests: vi.fn(), countSourcesByStatus: vi.fn(),
  getDatabaseSizeBytes: vi.fn(), listLargestTables: vi.fn(),
  listOrganizationsForAdmin: vi.fn(), listSourceHealthSample: vi.fn(),
}));
const { getQueueHealth, ping } = vi.hoisted(() => ({ getQueueHealth: vi.fn(), ping: vi.fn() }));
vi.mock("@cim/db", () => ({ db: {}, ...queries }));
vi.mock("./admin-queues", () => ({ getQueueHealth }));
vi.mock("./redis", () => ({ getRedis: () => ({ ping }) }));
import { loadAdminOverview } from "./admin-overview";

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  queries.checkDatabaseHealth.mockResolvedValue(true);
  queries.getPlatformTotals.mockResolvedValue({ totalOrganizations: 2, totalUsers: 3, totalSources: 5, totalMentions: 10, mentionsLast24h: 0 });
  queries.countSourcesByStatus.mockResolvedValue({ healthy: 5 });
  queries.countOpenTakedownRequests.mockResolvedValue(0);
  queries.getDatabaseSizeBytes.mockResolvedValue(1024);
  queries.listLargestTables.mockResolvedValue([]);
  queries.listOrganizationsForAdmin.mockResolvedValue([]);
  queries.listSourceHealthSample.mockResolvedValue([]);
  getQueueHealth.mockResolvedValue([]);
  ping.mockResolvedValue("PONG");
});
afterEach(() => vi.restoreAllMocks());

describe("admin overview outage isolation", () => {
  it("preserves real zero counts and empty lists as successful measurements", async () => {
    const data = await loadAdminOverview();
    expect(data.totals?.mentionsLast24h).toBe(0);
    expect(data.openTakedowns).toBe(0);
    expect(data.organizations).toEqual([]);
    expect(data.queues).toEqual([]);
    expect(data.dbHealthy).toBe(true);
    expect(data.redisHealthy).toBe(true);
  });

  it("keeps service reachability separate from a failed aggregate or queue query", async () => {
    queries.getPlatformTotals.mockRejectedValue(new Error("statement timeout"));
    queries.countSourcesByStatus.mockRejectedValue(new Error("count unavailable"));
    queries.countOpenTakedownRequests.mockRejectedValue(new Error("query failed"));
    getQueueHealth.mockRejectedValue(new Error("queue data unreadable"));
    const data = await loadAdminOverview();
    expect(data.totals).toBeNull();
    expect(data.statusCounts).toBeNull();
    expect(data.openTakedowns).toBeNull();
    expect(data.queues).toBeNull();
    expect(data.redisHealthy).toBe(true);
    expect(data.dbHealthy).toBe(true);
    expect(data.dbSizeBytes).toBe(1024);
    expect(data.sources).toEqual([]);
  });

  it("still returns an overview when both backing services fail", async () => {
    for (const query of Object.values(queries)) query.mockRejectedValue(new Error("database down"));
    ping.mockRejectedValue(new Error("redis down"));
    getQueueHealth.mockRejectedValue(new Error("redis down"));
    const data = await loadAdminOverview();
    expect(data.dbHealthy).toBe(false);
    expect(data.redisHealthy).toBe(false);
    for (const key of ["totals", "organizations", "sources", "statusCounts", "queues", "openTakedowns", "dbSizeBytes", "largestTables"] as const) {
      expect(data[key]).toBeNull();
    }
    expect(data.checkedAt).toBeInstanceOf(Date);
  });
});
