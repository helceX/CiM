import { describe, expect, it } from "vitest";
import { TURKEY_SOURCE_CATALOG, findCatalogSource } from "./source-catalog";

describe("TURKEY_SOURCE_CATALOG", () => {
  it("has unique keys and unique feed URLs", () => {
    const keys = TURKEY_SOURCE_CATALOG.map((e) => e.key);
    const urls = TURKEY_SOURCE_CATALOG.map((e) => e.url);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("only lists https feed URLs", () => {
    for (const entry of TURKEY_SOURCE_CATALOG) {
      expect(new URL(entry.url).protocol).toBe("https:");
    }
  });

  it("finds an entry by key", () => {
    expect(findCatalogSource("hurriyet")?.name).toBe("Hürriyet");
    expect(findCatalogSource("nope")).toBeUndefined();
  });
});
