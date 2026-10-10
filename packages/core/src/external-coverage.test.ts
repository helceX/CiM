import { describe, expect, it } from "vitest";
import {
  allowedGoogleTrendsGeographies,
  buildGoogleTrendsFeedUrl,
  isGoogleTrendsEnabled,
  parseGoogleTrendsFeedGeo,
} from "./external-coverage";

describe("Google Trends coverage policy", () => {
  it("requires both explicit switches", () => {
    expect(isGoogleTrendsEnabled({})).toBe(false);
    expect(isGoogleTrendsEnabled({ CIM_EXTERNAL_COVERAGE_ENABLED: "true" })).toBe(false);
    expect(isGoogleTrendsEnabled({ CIM_EXTERNAL_COVERAGE_ENABLED: "true", CIM_GOOGLE_TRENDS_RSS_ENABLED: "true" })).toBe(true);
  });

  it("defaults to Turkey and rejects unsupported or non-allowlisted URLs", () => {
    const geos = allowedGoogleTrendsGeographies({});
    expect(geos).toEqual(["TR"]);
    expect(buildGoogleTrendsFeedUrl("tr")).toBe("https://trends.google.com/trending/rss?geo=TR");
    expect(parseGoogleTrendsFeedGeo("https://trends.google.com/trending/rss?geo=TR", geos)).toBe("TR");
    expect(parseGoogleTrendsFeedGeo("https://trends.google.com/trending/rss?geo=US", geos)).toBeNull();
    expect(parseGoogleTrendsFeedGeo("http://trends.google.com/trending/rss?geo=TR", geos)).toBeNull();
    expect(parseGoogleTrendsFeedGeo("https://trends.google.com/trending/rss?geo=TR&x=1", geos)).toBeNull();
  });
});
