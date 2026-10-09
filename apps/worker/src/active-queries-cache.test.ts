import { beforeEach, describe, expect, it, vi } from "vitest";

const listActive = vi.fn();
vi.mock("@cim/db", () => ({
  db: {},
  listActiveMonitoringQueriesForSourceType: (...args: unknown[]) => listActive(...args),
}));

const { ACTIVE_QUERIES_TTL_MS, clearActiveQueriesCache, getActiveQueries } = await import("./active-queries-cache");

beforeEach(() => {
  vi.clearAllMocks();
  clearActiveQueriesCache();
});

describe("getActiveQueries", () => {
  it("reads the monitorings once per source type per minute, and shares one read between crawls running at once", async () => {
    listActive.mockResolvedValue([{ id: "q1" }]);
    const [a, b] = await Promise.all([getActiveQueries("news", 1_000), getActiveQueries("news", 1_001)]);
    expect(a).toBe(b);
    await getActiveQueries("news", 1_000 + ACTIVE_QUERIES_TTL_MS - 1);
    expect(listActive).toHaveBeenCalledTimes(1);

    await getActiveQueries("blog", 2_000); // another type is its own entry
    expect(listActive).toHaveBeenCalledTimes(2);

    await getActiveQueries("news", 1_000 + ACTIVE_QUERIES_TTL_MS); // a minute later it reads again
    expect(listActive).toHaveBeenCalledTimes(3);
  });

  it("does not keep a failed read for a minute", async () => {
    listActive.mockRejectedValueOnce(new Error("transient"));
    await expect(getActiveQueries("news", 1_000)).rejects.toThrow("transient");
    listActive.mockResolvedValueOnce([{ id: "q1" }]);
    await expect(getActiveQueries("news", 1_010)).resolves.toEqual([{ id: "q1" }]);
  });
});
