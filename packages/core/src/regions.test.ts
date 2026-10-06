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
import { SOURCE_KINDS, sourceKindOfType, sourceTypeBadge } from "./source-categories";

describe("regions", () => {
  it("has unique ISO codes and every continent is populated", () => {
    const codes = COUNTRIES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const continent of CONTINENTS) {
      expect(countriesInContinent(continent.code).length).toBeGreaterThan(0);
    }
  });

  it("puts transcontinental countries under both continents", () => {
    expect(continentsOfCountry("TR")).toEqual(["ASI", "EUR"]);
    expect(countryInScope("TR", "EUR")).toBe(true);
    expect(countryInScope("TR", "ASI")).toBe(true);
    expect(countryInScope("TR", "AFR")).toBe(false);
    expect(countryInScope("DE", "ASI")).toBe(false);
  });

  it("never mistakes a country for a continent (AF, NA, SA are Afghanistan, Namibia, Saudi Arabia)", () => {
    expect(countryInScope("AF", "AF")).toBe(true);
    expect(countryInScope("AF", "AFR")).toBe(false);
    expect(countryInScope("NA", "NA")).toBe(true);
    expect(countryInScope("NA", "AFR")).toBe(true); // Namibia is in Africa
    expect(countryInScope("SA", "SAM")).toBe(false);
    expect(countryInScope("SA", "ASI")).toBe(true);
    expect(countryCodesInScope("SA")).toEqual(["SA"]);
  });

  it("scopes world, continent and country", () => {
    expect(countryInScope(null, "world")).toBe(true);
    expect(countryInScope(null, "EUR")).toBe(false);
    expect(countryInScope("tr", "TR")).toBe(true);
    expect(countryCodesInScope("world")).toBeNull();
    expect(countryCodesInScope("TR")).toEqual(["TR"]);
    expect(countryCodesInScope("EUR")).toContain("DE");
    expect(countryCodesInScope("EUR")).toContain("TR");
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
    // Digital news, agencies, newspapers and magazines share one cluster, each with its own badge.
    expect(["news", "press", "newspaper", "magazine"].map(sourceKindOfType)).toEqual(["news", "news", "news", "news"]);
    expect(["news", "newspaper", "magazine", "press"].map(sourceTypeBadge)).toEqual(["Digital news", "Newspaper", "Magazine", "News agency"]);
    expect(sourceTypeBadge("unheard-of")).toBe("Other");
    expect(sourceKindOfType("forum")).toBe("forums");
    expect(sourceKindOfType("something-new")).toBe("feeds");
  });
});
