import { expect, it, vi } from "vitest";
const { exec } = vi.hoisted(() => ({ exec: vi.fn() }));
vi.mock("./redis", () => ({
  getRedis: () => ({ pipeline: () => ({ hgetall() {}, exec }) }),
}));
import { getCrawlStats } from "./crawl-stats";
it("preserves zero activity but does not turn partial/corrupt crawl counters into zeros", async () => {
  exec.mockResolvedValue([
    [null, {}],
    [null, {}],
  ]);
  expect((await getCrawlStats(2))?.checks).toBe(0);
  exec.mockResolvedValue([
    [null, {}],
    [new Error("read failed"), null],
  ]);
  expect(await getCrawlStats(2)).toBeNull();
  exec.mockResolvedValue([]);
  expect(await getCrawlStats(2)).toBeNull();
  exec.mockResolvedValue([
    [null, { checks: "bad" }],
    [null, {}],
  ]);
  expect(await getCrawlStats(2)).toBeNull();
});
