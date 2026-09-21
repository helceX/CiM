import { describe, expect, it } from "vitest";
import { isAllowedByRobotsTxt, isPathAllowedByRobots } from "./robots";

describe("isPathAllowedByRobots", () => {
  it("allows everything when robots.txt has no applicable group", () => {
    expect(isPathAllowedByRobots("User-agent: SomeOtherBot\nDisallow: /", "CiM-Bot", "/private")).toBe(true);
  });

  it("disallows a path blocked for the wildcard group", () => {
    const robots = "User-agent: *\nDisallow: /admin";
    expect(isPathAllowedByRobots(robots, "CiM-Bot", "/admin/secret")).toBe(false);
    expect(isPathAllowedByRobots(robots, "CiM-Bot", "/public")).toBe(true);
  });

  it("prefers a group matching our user agent by name over the wildcard group", () => {
    const robots = "User-agent: CiM-Bot\nAllow: /\n\nUser-agent: *\nDisallow: /";
    expect(isPathAllowedByRobots(robots, "CiM-Bot", "/anything")).toBe(true);
  });

  it("uses longest-prefix-match when both Allow and Disallow could apply", () => {
    const robots = "User-agent: *\nDisallow: /articles\nAllow: /articles/public";
    expect(isPathAllowedByRobots(robots, "CiM-Bot", "/articles/private")).toBe(false);
    expect(isPathAllowedByRobots(robots, "CiM-Bot", "/articles/public/1")).toBe(true);
  });

  it("treats an empty Disallow value as allow-all", () => {
    expect(isPathAllowedByRobots("User-agent: *\nDisallow:", "CiM-Bot", "/anything")).toBe(true);
  });

  it("ignores comments and Sitemap/Crawl-delay directives", () => {
    const robots = "# comment\nUser-agent: *\nCrawl-delay: 5\nSitemap: https://example.com/sitemap.xml\nDisallow: /x";
    expect(isPathAllowedByRobots(robots, "CiM-Bot", "/x/y")).toBe(false);
    expect(isPathAllowedByRobots(robots, "CiM-Bot", "/y")).toBe(true);
  });
});

describe("isAllowedByRobotsTxt", () => {
  it("fails open (allowed) when robots.txt can't be fetched", async () => {
    // No local server needed: robots.txt is politeness, not the security
    // boundary (docs/architecture/INGESTION.md) — a target robots.txt
    // couldn't be fetched (blocked, unreachable, 404, whatever the
    // reason) never blocks the crawl on its own. safeFetch's real
    // DNS-backed SSRF guard, exercised unmodified here, is what actually
    // stops a request to an internal address like this one; this test
    // confirms that failure is absorbed as "allowed" rather than
    // propagating and taking down the caller.
    await expect(isAllowedByRobotsTxt("http://127.0.0.1:1/x")).resolves.toBe(true);
  });
});
