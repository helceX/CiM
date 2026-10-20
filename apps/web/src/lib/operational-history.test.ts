import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { mget } = vi.hoisted(() => ({ mget: vi.fn() }));
vi.mock("./redis", () => ({ getRedis: () => ({ mget }) }));
import { getSourceDiagnostics, getStorageHistory } from "./operational-history";
beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("admin operational history reads", () => {
  it("distinguishes missing days from a failed or partial Redis read", async () => {
    mget.mockResolvedValue(Array(60).fill(null));
    expect(await getStorageHistory(new Date("2026-10-20T12:00:00Z"))).toEqual([]);
    mget.mockResolvedValue([]);
    expect(await getStorageHistory()).toBeNull();
    mget.mockRejectedValue(new Error("Redis down"));
    expect(await getStorageHistory()).toBeNull();
  });
  it("returns actual measured dates in order without filling gaps", async () => {
    const values = Array(60).fill(null);
    values[57] = JSON.stringify({ at: "2026-10-18T08:45:00Z", bytes: 200 });
    values[59] = JSON.stringify({ at: "2026-10-20T08:45:00Z", bytes: 100 });
    mget.mockResolvedValue(values);
    expect(await getStorageHistory(new Date("2026-10-20T12:00:00Z"))).toEqual([
      { at: "2026-10-18T08:45:00Z", bytes: 200 },
      { at: "2026-10-20T08:45:00Z", bytes: 100 },
    ]);
    values[58] = "corrupt";
    expect(await getStorageHistory(new Date("2026-10-20T12:00:00Z"))).toBeNull();
  });
  it("keeps legacy/expired source reasons unknown and reports a failed read", async () => {
    mget.mockResolvedValue([null, JSON.stringify({ failures: 2 })]);
    expect(await getSourceDiagnostics(["a", "b"])).toEqual({ a: null, b: null });
    mget.mockRejectedValue(new Error("Redis down"));
    expect(await getSourceDiagnostics(["a"])).toBeNull();
  });
});
