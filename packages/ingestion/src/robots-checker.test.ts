import { describe, expect, it, vi } from "vitest";
import type { SafeFetchResult } from "./safe-fetch";

/**
 * createRobotsChecker() calls the real safeFetch internally (via
 * robots.ts's private fetchRobotsTxt) — mocking it here, rather than
 * standing up a real HTTP server, is necessary because a real loopback
 * server would be rejected by safeFetch's own SSRF guard before ever
 * connecting (127.0.0.1 is blocked by design), which would make every
 * assertion below about request counts vacuously true. Same layering
 * rationale as sitemap-connector.test.ts.
 */
const safeFetchMock = vi.fn<(url: string, options?: unknown) => Promise<SafeFetchResult>>();
vi.mock("./safe-fetch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./safe-fetch")>();
  return {
    ...actual,
    safeFetch: (...args: Parameters<typeof safeFetchMock>) => safeFetchMock(...args),
  };
});

const { createRobotsChecker } = await import("./robots");

function fetchResult(overrides: Partial<SafeFetchResult> = {}): SafeFetchResult {
  return { status: 200, headers: new Headers() as never, body: "", finalUrl: "", ...overrides };
}

describe("createRobotsChecker", () => {
  it("fetches robots.txt once per host, not once per checked URL", async () => {
    safeFetchMock.mockResolvedValue(fetchResult({ body: "User-agent: *\nDisallow: /blocked" }));
    const isAllowed = createRobotsChecker();

    await isAllowed("https://cim-robots-test.invalid/a");
    await isAllowed("https://cim-robots-test.invalid/b");
    await isAllowed("https://cim-robots-test.invalid/blocked/c");

    expect(safeFetchMock).toHaveBeenCalledTimes(1);
    expect(safeFetchMock).toHaveBeenCalledWith(
      "https://cim-robots-test.invalid/robots.txt",
      expect.anything(),
    );
  });

  it("still applies the fetched rules correctly to every checked URL", async () => {
    safeFetchMock.mockResolvedValue(fetchResult({ body: "User-agent: *\nDisallow: /blocked" }));
    const isAllowed = createRobotsChecker();

    expect(await isAllowed("https://cim-robots-test.invalid/ok")).toBe(true);
    expect(await isAllowed("https://cim-robots-test.invalid/blocked/x")).toBe(false);
  });

  it("fetches separately for a different host", async () => {
    safeFetchMock.mockResolvedValue(fetchResult({ body: "User-agent: *\nAllow: /" }));
    const isAllowed = createRobotsChecker();

    await isAllowed("https://cim-robots-test-a.invalid/x");
    await isAllowed("https://cim-robots-test-b.invalid/x");

    expect(safeFetchMock).toHaveBeenCalledTimes(2);
  });

  it("a fresh checker instance fetches again — caching doesn't leak across crawl ticks", async () => {
    safeFetchMock.mockResolvedValue(fetchResult({ body: "User-agent: *\nAllow: /" }));

    await createRobotsChecker()("https://cim-robots-test.invalid/x");
    await createRobotsChecker()("https://cim-robots-test.invalid/x");

    expect(safeFetchMock).toHaveBeenCalledTimes(2);
  });
});
