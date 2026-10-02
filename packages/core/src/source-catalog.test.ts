import { describe, expect, it } from "vitest";
import { CATALOG_GROUPS, TURKEY_SOURCE_CATALOG, feedIdentity, findCatalogSource } from "./source-catalog";
import { GENERATED_CATALOG } from "./source-catalog.generated";
import { LIST_CATALOG } from "./source-catalog.list.generated";
import { hostOfUrl } from "./restricted-publishers";

describe("TURKEY_SOURCE_CATALOG", () => {
  it("has unique keys and unique feed URLs", () => {
    const keys = TURKEY_SOURCE_CATALOG.map((e) => e.key);
    const urls = TURKEY_SOURCE_CATALOG.map((e) => e.url);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("lists the same feed only once, however its address is written", () => {
    const identities = TURKEY_SOURCE_CATALOG.map((e) => feedIdentity(e.url));
    expect(new Set(identities).size).toBe(identities.length);
    expect(feedIdentity("https://www.Example.com/feed/")).toBe(feedIdentity("https://example.com/feed"));
    expect(feedIdentity("https://example.com/rss?cat=a")).not.toBe(feedIdentity("https://example.com/rss?cat=b"));
  });

  it("only lists https feed URLs", () => {
    for (const entry of TURKEY_SOURCE_CATALOG) {
      expect(new URL(entry.url).protocol).toBe("https:");
    }
  });

  it("only uses known groups", () => {
    for (const entry of TURKEY_SOURCE_CATALOG) {
      expect(CATALOG_GROUPS).toContain(entry.group);
    }
  });

  it("includes the community list on top of the curated one, with the curated entry winning", () => {
    expect(GENERATED_CATALOG.length).toBeGreaterThan(300);
    expect(TURKEY_SOURCE_CATALOG.length).toBeGreaterThan(300);
    expect(findCatalogSource("hurriyet")?.name).toBe("Hürriyet");
    expect(findCatalogSource("nope")).toBeUndefined();
  });

  it("drops licence-required agencies that appear in the community list", () => {
    const generatedHosts = GENERATED_CATALOG.map((e) => hostOfUrl(e.url));
    expect(generatedHosts).toContain("aa.com.tr"); // present in the source list…
    const merged = TURKEY_SOURCE_CATALOG.map((e) => hostOfUrl(e.url));
    expect(merged).not.toContain("aa.com.tr"); // …but never offered
  });

  it("adds the verified feed list without repeating any feed already in the community list", () => {
    expect(LIST_CATALOG.length).toBeGreaterThan(1500);
    const earlier = new Set([...GENERATED_CATALOG].map((e) => feedIdentity(e.url)));
    for (const entry of LIST_CATALOG) expect(earlier.has(feedIdentity(entry.url))).toBe(false);
    // Every one of them survives the merge (the merge only drops repeats and licence-required hosts).
    const merged = new Set(TURKEY_SOURCE_CATALOG.map((e) => e.key));
    for (const entry of LIST_CATALOG) expect(merged.has(entry.key)).toBe(true);
  });

  it("keeps columnist and forum feeds in their own groups so a bulk add can leave them out", () => {
    const columns = TURKEY_SOURCE_CATALOG.filter((e) => e.group === "columns");
    expect(columns.length).toBeGreaterThan(100);
    expect(columns.every((e) => /\/(yazar|yazarlar|author)\//.test(e.url) || /yazi/.test(e.url) || e.url.endsWith("/rssmakale"))).toBe(true);
    const forums = TURKEY_SOURCE_CATALOG.filter((e) => e.group === "forums");
    expect(forums.length).toBeGreaterThan(5);
    expect(forums.every((e) => e.type === "forum")).toBe(true);
  });
});
