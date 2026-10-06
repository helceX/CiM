import { describe, expect, it } from "vitest";
import { feedIdentity, TURKEY_SOURCE_CATALOG } from "./source-catalog";
import { countryByCode } from "./regions";
import { hostOfUrl, isLicenseRequiredHost } from "./restricted-publishers";
import { WORLD_CATALOG_GROUP_LABELS, WORLD_SOURCE_CATALOG } from "./world-catalog";

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
