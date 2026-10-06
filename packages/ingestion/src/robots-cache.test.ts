import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SafeFetchResult } from "./safe-fetch";

const safeFetchMock = vi.fn<(url: string, options?: unknown) => Promise<SafeFetchResult>>();
vi.mock("./safe-fetch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./safe-fetch")>();
  return { ...actual, safeFetch: (...args: Parameters<typeof safeFetchMock>) => safeFetchMock(...args) };
});

const { clearRobotsCache, isExplicitlyBlockedByRobots } = await import("./robots");

const robots = (body: string): SafeFetchResult => ({ status: 200, headers: new Headers() as never, body, finalUrl: "" });

describe("isExplicitlyBlockedByRobots caching", () => {
  beforeEach(() => {
    clearRobotsCache();
    safeFetchMock.mockReset();
  });

  it("downloads a host's robots.txt once for all of its feeds, and for simultaneous callers", async () => {
    safeFetchMock.mockResolvedValue(robots("User-agent: Mediaory-Bot\nDisallow: /private/"));
    const results = await Promise.all([
      isExplicitlyBlockedByRobots("https://pub.example/rss/a.xml"),
      isExplicitlyBlockedByRobots("https://pub.example/rss/b.xml"),
      isExplicitlyBlockedByRobots("https://pub.example/private/c.xml"),
    ]);
    expect(results).toEqual([false, false, true]);
    expect(await isExplicitlyBlockedByRobots("https://pub.example/rss/d.xml")).toBe(false);
    expect(safeFetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps hosts apart, and remembers a missing robots.txt as 'no restriction'", async () => {
    safeFetchMock.mockRejectedValue(new Error("unreachable"));
    expect(await isExplicitlyBlockedByRobots("https://one.example/f.xml")).toBe(false);
    expect(await isExplicitlyBlockedByRobots("https://one.example/g.xml")).toBe(false);
    expect(await isExplicitlyBlockedByRobots("https://two.example/f.xml")).toBe(false);
    expect(safeFetchMock).toHaveBeenCalledTimes(2);
  });
});
