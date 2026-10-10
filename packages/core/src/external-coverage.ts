import { COUNTRIES } from "./regions";

export type CoverageEnvironment = Readonly<Record<string, string | undefined>>;

/** Both switches must be explicitly true. An absent env var always means off. */
export function isGoogleTrendsEnabled(env: CoverageEnvironment): boolean {
  return env.CIM_EXTERNAL_COVERAGE_ENABLED === "true" && env.CIM_GOOGLE_TRENDS_RSS_ENABLED === "true";
}

/** Country-specific RSS sources are global and contain no tenant search terms. TR is the initial allowlist. */
export function allowedGoogleTrendsGeographies(env: CoverageEnvironment): string[] {
  const configured = (env.CIM_GOOGLE_TRENDS_GEOS ?? "TR").split(",").map((code) => code.trim().toUpperCase()).filter(Boolean);
  const known = new Set(COUNTRIES.map((country) => country.code));
  return [...new Set(configured)].filter((code) => known.has(code));
}

export function buildGoogleTrendsFeedUrl(geo: string): string | null {
  const code = geo.trim().toUpperCase();
  return COUNTRIES.some((country) => country.code === code)
    ? `https://trends.google.com/trending/rss?geo=${code}`
    : null;
}

export function parseGoogleTrendsFeedGeo(url: string, allowlist: readonly string[]): string | null {
  try {
    const parsed = new URL(url);
    const geo = parsed.searchParams.get("geo")?.toUpperCase();
    if (
      parsed.protocol !== "https:" ||
      parsed.hostname !== "trends.google.com" ||
      parsed.pathname !== "/trending/rss" ||
      parsed.searchParams.size !== 1 ||
      !geo ||
      !allowlist.includes(geo) ||
      !COUNTRIES.some((country) => country.code === geo)
    ) return null;
    return geo;
  } catch {
    return null;
  }
}
