import { describe, expect, it } from "vitest";
import {
  COUNTRIES,
  CONTINENTS,
  countriesInContinent,
  countryCodesInScope,
  countryInScope,
  countryName,
  continentsOfCountry,
} from "./regions";
import { SOURCE_KINDS, sourceKindOfType } from "./source-categories";

describe("regions", () => {
  it("has unique ISO codes and every continent is populated", () => {
    const codes = COUNTRIES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const continent of CONTINENTS) {
      expect(countriesInContinent(continent.code).length).toBeGreaterThan(0);
    }
  });

  it("puts transcontinental countries under both continents", () => {
    expect(continentsOfCountry("TR")).toEqual(["AS", "EU"]);
    expect(countryInScope("TR", "EU")).toBe(true);
    expect(countryInScope("TR", "AS")).toBe(true);
    expect(countryInScope("TR", "AF")).toBe(false);
    expect(countryInScope("DE", "AS")).toBe(false);
  });

  it("scopes world, continent and country", () => {
    expect(countryInScope(null, "world")).toBe(true);
    expect(countryInScope(null, "EU")).toBe(false);
    expect(countryInScope("tr", "TR")).toBe(true);
    expect(countryCodesInScope("world")).toBeNull();
    expect(countryCodesInScope("TR")).toEqual(["TR"]);
    expect(countryCodesInScope("EU")).toContain("DE");
    expect(countryCodesInScope("EU")).toContain("TR");
  });

  it("names unknown codes instead of failing", () => {
    expect(countryName("TR")).toBe("Türkiye");
    expect(countryName("ZZ")).toBe("ZZ");
    expect(countryName(null)).toBe("Unknown");
  });
});

describe("source kinds", () => {
  it("maps every source type to exactly one kind", () => {
    const all = SOURCE_KINDS.flatMap((kind) => kind.types);
    expect(new Set(all).size).toBe(all.length);
    expect(sourceKindOfType("press")).toBe("news");
    expect(sourceKindOfType("forum")).toBe("forums");
    expect(sourceKindOfType("something-new")).toBe("feeds");
  });
});
