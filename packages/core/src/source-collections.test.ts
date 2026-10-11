import { describe, expect, it } from "vitest";
import {
  foreignCatalogCountry,
  isColumnistFeed,
  sourceCollections,
} from "./source-collections";
import { TURKEY_SOURCE_CATALOG } from "./source-catalog";

const source = {
  name: "General news",
  domain: "publisher.com",
  url: "https://publisher.com/feed",
  country: "US",
  language: "en",
};
describe("crawl collections", () => {
  it("keeps Turkish feeds worldwide, including explicit locale URLs", () => {
    expect(sourceCollections({ ...source, language: "tr-TR" })).toContain("turkey");
    expect(
      sourceCollections({ ...source, url: "https://publisher.com/turkce/feed" }),
    ).toContain("turkey");
    expect(
      sourceCollections({ ...source, url: "https://publisher.com/feed?lang=tr" }),
    ).toContain("turkey");
    expect(sourceCollections({ ...source, country: "TR" })).toContain("turkey");
  });
  it("keeps relevant global startup feeds but not all technology or financial news", () => {
    expect(
      sourceCollections({ ...source, name: "Venture capital funding calls" }),
    ).toContain("startup");
    expect(sourceCollections({ ...source, domain: "techcrunch.com" })).toContain(
      "startup",
    );
    expect(
      sourceCollections({ ...source, name: "Windows technology and stock market" }),
    ).toEqual([]);
    expect(
      sourceCollections({
        ...source,
        domain: "travel.com",
        url: "https://travel.com/travel/feed",
      }),
    ).toEqual([]);
  });
  it("allows both collections and recognizes previously paused writer feeds", () => {
    expect(
      sourceCollections({ ...source, language: "tr", name: "Girişimcilik ve hibe" }),
    ).toEqual(["turkey", "startup"]);
    const writer = TURKEY_SOURCE_CATALOG.find((s) => s.group === "columns")!;
    expect(isColumnistFeed({ ...source, url: writer.url })).toBe(true);
  });
  it("does not mistake a place name for funding, but retains entrepreneurship sections", () => {
    expect(
      sourceCollections({
        ...source,
        name: "Grant County Press",
        domain: "grantcountypress.com",
        url: "https://grantcountypress.com/index.php?format=feed&type=rss",
      }),
    ).toEqual([]);
    expect(
      sourceCollections({
        ...source,
        name: "Naharnet",
        domain: "naharnet.com",
        country: "LB",
        url: "https://naharnet.com/tags/entrepreneurship/en/feed.atom",
      }),
    ).toEqual(["startup"]);
  });
  it("uses English feed metadata instead of a translated administrative name", () => {
    const nih = {
      ...source,
      name: "NIH finansman fırsatları",
      domain: "grants.nih.gov",
      country: "TR",
      url: "https://grants.nih.gov/grants/guide/newsfeed/fundingopps.xml",
    };
    expect(sourceCollections(nih)).toEqual(["startup"]);
    expect(foreignCatalogCountry(nih)).toBe("US");
    const aiib = {
      ...source,
      name: "AIIB onaylanmış projeler",
      domain: "aiib.org",
      country: "TR",
      url: "https://www.aiib.org/en/rss/aiib-projects-approved-rss.xml",
    };
    expect(sourceCollections(aiib)).toEqual(["startup"]);
    expect(foreignCatalogCountry(aiib)).toBeNull();
    expect(sourceCollections({ ...nih, language: "tr" })).toContain("turkey");
  });
});
