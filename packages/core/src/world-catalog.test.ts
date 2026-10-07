import { describe, expect, it } from "vitest";
import { feedIdentity, TURKEY_SOURCE_CATALOG } from "./source-catalog";
import { countryByCode } from "./regions";
import { hostOfUrl, isLicenseRequiredHost } from "./restricted-publishers";
import { STARTUP_PAGE_CANDIDATES, WORLD_CATALOG_GROUP_LABELS, WORLD_SOURCE_CATALOG } from "./world-catalog";

const ADMIN_TYPES = new Set(["news", "newspaper", "magazine", "press", "blog", "website", "forum", "comments", "social", "youtube", "podcast"]);

describe("world catalog", () => {
  it("is large, and every entry is a usable https feed with a known group and type", () => {
    expect(WORLD_SOURCE_CATALOG.length).toBeGreaterThan(4000);
    for (const entry of WORLD_SOURCE_CATALOG) {
      expect(entry.url.startsWith("https://")).toBe(true);
      expect(entry.name.trim()).not.toBe("");
      expect(WORLD_CATALOG_GROUP_LABELS[entry.group]).toBeDefined();
      expect(ADMIN_TYPES.has(entry.type)).toBe(true);
      expect(entry.language).toMatch(/^([a-z]{2,3})?$/);
    }
  });

  it("has unique keys and feeds, and repeats nothing the Türkiye catalog already lists", () => {
    expect(new Set(WORLD_SOURCE_CATALOG.map((e) => e.key)).size).toBe(WORLD_SOURCE_CATALOG.length);
    const identities = WORLD_SOURCE_CATALOG.map((e) => feedIdentity(e.url));
    expect(new Set(identities).size).toBe(identities.length);
    const turkey = new Set(TURKEY_SOURCE_CATALOG.map((e) => feedIdentity(e.url)));
    expect(identities.filter((id) => turkey.has(id))).toEqual([]);
  });

  it("leaves out licence-required agencies and Reddit", () => {
    for (const entry of WORLD_SOURCE_CATALOG) {
      const host = hostOfUrl(entry.url)!;
      expect(isLicenseRequiredHost(host)).toBe(false);
      expect(/(^|\.)reddit\.com$/.test(host)).toBe(false);
    }
  });

  it("uses only country codes the region tree knows (or none, for global feeds)", () => {
    const unknown = new Set<string>();
    for (const entry of WORLD_SOURCE_CATALOG) {
      if (entry.country && !countryByCode(entry.country)) unknown.add(entry.country);
    }
    expect([...unknown]).toEqual([]);
    expect(WORLD_SOURCE_CATALOG.some((e) => e.country === "")).toBe(true);
    expect(WORLD_SOURCE_CATALOG.some((e) => e.country === "US")).toBe(true);
  });
});

describe("startup catalog", () => {
  const startupFeeds = WORLD_SOURCE_CATALOG.filter((e) => e.group === "startup");

  it("adds the directories' feeds as their own group, once each", () => {
    expect(startupFeeds.length).toBeGreaterThan(25);
    expect(startupFeeds.some((e) => e.country === "TR")).toBe(true);
    expect(startupFeeds.some((e) => e.country === "GB" || e.country === "US" || e.country === "")).toBe(true);
    // Webrazzi is already in the Türkiye catalog and must not appear a second time.
    expect(startupFeeds.some((e) => /webrazzi\.com\/feed\/?$/.test(e.url))).toBe(false);
  });

  it("lists organisations without an RSS address as pages to look for a feed on, one per site", () => {
    expect(STARTUP_PAGE_CANDIDATES.length).toBeGreaterThan(150);
    const hosts = STARTUP_PAGE_CANDIDATES.map((e) => new URL(e.url).hostname.replace(/^www\./, ""));
    expect(new Set(hosts).size).toBe(hosts.length);
    const feedHosts = new Set([...TURKEY_SOURCE_CATALOG, ...WORLD_SOURCE_CATALOG].map((e) => new URL(e.url).hostname.replace(/^www\./, "")));
    for (const host of hosts) expect(feedHosts.has(host)).toBe(false);
    for (const entry of STARTUP_PAGE_CANDIDATES) {
      expect(entry.url.startsWith("https://")).toBe(true);
      expect(isLicenseRequiredHost(hostOfUrl(entry.url)!)).toBe(false);
      expect(entry.country === "" || countryByCode(entry.country)).toBeTruthy();
    }
  });

  it("imports page candidates marked for discovery, Türkiye's early", async () => {
    const { CATALOG_IMPORT_ORDER } = await import("./catalog-import");
    const pages = CATALOG_IMPORT_ORDER.filter((e) => e.discover);
    expect(pages).toHaveLength(STARTUP_PAGE_CANDIDATES.length);
    expect(pages.filter((e) => e.country === "TR").every((e) => e.rank === 1)).toBe(true);
    expect(pages.filter((e) => e.country !== "TR").every((e) => e.rank === 3)).toBe(true);
  });
});

describe("catalog import order", () => {
  it("lists every Türkiye and world feed once, home market and checked feeds first", async () => {
    const { CATALOG_IMPORT_ORDER } = await import("./catalog-import");
    expect(CATALOG_IMPORT_ORDER.length).toBe(TURKEY_SOURCE_CATALOG.length + WORLD_SOURCE_CATALOG.length + STARTUP_PAGE_CANDIDATES.length);
    expect(new Set(CATALOG_IMPORT_ORDER.map((e) => e.url)).size).toBe(CATALOG_IMPORT_ORDER.length);
    const ranks = CATALOG_IMPORT_ORDER.map((e) => e.rank);
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
    expect(CATALOG_IMPORT_ORDER[0]!.country).toBe("TR");
    for (const entry of CATALOG_IMPORT_ORDER) {
      expect(entry.language).toMatch(/^([a-z]{2,3}|other)$/);
      expect(entry.country).toMatch(/^[A-Z]{2}$/);
    }
  });
});
