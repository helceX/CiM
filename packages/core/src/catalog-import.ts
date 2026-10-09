import { TURKEY_SOURCE_CATALOG } from "./source-catalog";
import { inferCountryFromHost } from "./country-from-host";
import { hostOfUrl } from "./restricted-publishers";
import { STARTUP_PAGE_CANDIDATES, WORLD_SOURCE_CATALOG } from "./world-catalog";

/**
 * What the background catalog import adds, and in which order. Imported as
 * `@cim/core/catalog-import` (it pulls in the world catalog's data, which the main
 * entry deliberately does not).
 *
 * Order matters because the crawler's capacity is finite: the Türkiye news feeds
 * first (the home market), then the world feeds the research pack's own XML check
 * passed, then Türkiye's one-per-writer columns and forums, then the rest of the
 * world — blogs, forums, podcasts and video last.
 */
export type ImportCandidate = {
  key: string;
  name: string;
  url: string;
  type: string;
  /** ISO 639 code or "other" */
  language: string;
  /** ISO country, "ZZ" = none / global */
  country: string;
  verified: boolean;
  rank: number;
  /** `url` is an organisation's web page, not a feed: look for its feed there before adding anything. */
  discover?: boolean;
};

const LATE_WORLD_GROUPS = new Set(["blogs", "forums", "podcasts", "video", "social", "reference"]);

function rank(entry: ImportCandidate): number {
  return entry.rank;
}

export const CATALOG_IMPORT_ORDER: readonly ImportCandidate[] = [
  ...TURKEY_SOURCE_CATALOG.map<ImportCandidate>((e) => ({
    key: e.key,
    name: e.name,
    url: e.url,
    type: e.type,
    language: e.language,
    country: e.country,
    verified: false,
    rank: e.group === "columns" || e.group === "forums" ? 2 : 0,
  })),
  ...WORLD_SOURCE_CATALOG.filter((e) => !e.manualOnly).map<ImportCandidate>((e) => ({
    key: e.key,
    name: e.name,
    url: e.url,
    type: e.type,
    language: e.language || "other",
    country: e.country || inferCountryFromHost(hostOfUrl(e.url)) || "ZZ",
    verified: e.verified,
    rank: e.group === "startup" || e.verified ? 1 : LATE_WORLD_GROUPS.has(e.group) ? 4 : 3,
  })),
  // Startup / funding organisations with no RSS in the directory: Türkiye's first, the rest with the world feeds.
  ...STARTUP_PAGE_CANDIDATES.map<ImportCandidate>((e) => ({
    key: e.key,
    name: e.name,
    url: e.url,
    type: e.type,
    language: e.language || "other",
    country: e.country || inferCountryFromHost(hostOfUrl(e.url)) || "ZZ",
    verified: false,
    rank: (e.country || inferCountryFromHost(hostOfUrl(e.url))) === "TR" ? 1 : 3,
    discover: true,
  })),
].sort((a, b) => rank(a) - rank(b));
