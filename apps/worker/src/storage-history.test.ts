import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const { getDatabaseSizeBytes, connect, set, disconnect } = vi.hoisted(() => ({
  getDatabaseSizeBytes: vi.fn(),
  connect: vi.fn(),
  set: vi.fn(),
  disconnect: vi.fn(),
}));
vi.mock("@cim/db", () => ({ db: {}, getDatabaseSizeBytes }));
vi.mock("@cim/config", () => ({ getEnv: () => ({ REDIS_URL: "redis://localhost" }) }));
vi.mock("ioredis", () => ({
  default: class {
    connect = connect;
    set = set;
    disconnect = disconnect;
    on() {}
  },
}));
import { captureStorageSnapshot } from "./storage-history";
beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  getDatabaseSizeBytes.mockResolvedValue(1024);
});
afterEach(() => vi.restoreAllMocks());
describe("non-blocking daily storage capture", () => {
  it("uses an atomic first-write per day and closes the monitoring connection", async () => {
    await captureStorageSnapshot(new Date("2026-10-20T08:45:00Z"));
    expect(set).toHaveBeenCalledWith(
      "platform:storage:2026-10-20",
      JSON.stringify({ at: "2026-10-20T08:45:00.000Z", bytes: 1024 }),
      "EX",
      60 * 86_400,
      "NX",
    );
    expect(disconnect).toHaveBeenCalledOnce();
  });
  it("does not throw or leak a connection when Redis fails", async () => {
    connect.mockRejectedValue(new Error("Redis down"));
    await expect(captureStorageSnapshot()).resolves.toBeUndefined();
    expect(set).not.toHaveBeenCalled();
    expect(disconnect).toHaveBeenCalledOnce();
  });
  it("does not store an invalid or unavailable database measurement", async () => {
    getDatabaseSizeBytes.mockRejectedValueOnce(new Error("DB down"));
    await expect(captureStorageSnapshot()).resolves.toBeUndefined();
    getDatabaseSizeBytes.mockResolvedValueOnce(NaN);
    await expect(captureStorageSnapshot()).resolves.toBeUndefined();
    expect(connect).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
  });
});
