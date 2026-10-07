import { feedIdentity, TURKEY_SOURCE_CATALOG } from "./source-catalog";
import { WORLD_CATALOG_ROWS } from "./world-catalog.generated";
import { STARTUP_FEED_ROWS, STARTUP_PAGE_ROWS } from "./startup-catalog.generated";

/**
 * The world RSS pack (7,700 candidates researched by the operator, 5 Oct 2026),
 * after leaving out what the catalog never lists: plain-http feeds, Reddit
 * (its RSS ends 13 Nov 2026), licence-required agencies, and every feed the
 * Türkiye catalog already has. Kept out of the main `@cim/core` entry on
 * purpose — it is ~450 KB of data only the admin Sources page needs, so it is
 * imported as `@cim/core/world-catalog`.
 *
 * Candidates, not guarantees: `verified` only says the pack's own XML check
 * passed on the day. Every feed is fetch-tested at /admin/sources before it is stored.
 */
export type WorldCatalogGroup =
  | "general"
  | "local"
  | "economy"
  | "technology"
  | "science"
  | "sports"
  | "culture"
  | "entertainment"
  | "lifestyle"
  | "defense"
  | "blogs"
  | "forums"
  | "podcasts"
  | "video"
  | "social"
  | "reference"
  | "startup";

export const WORLD_CATALOG_GROUP_LABELS: Record<WorldCatalogGroup, string> = {
  general: "General news",
  local: "Local & regional news",
  economy: "Economy & business",
  technology: "Technology",
  science: "Science",
  sports: "Sports",
  culture: "Culture & arts",
  entertainment: "Entertainment & games",
  lifestyle: "Lifestyle, travel & health",
  defense: "Defense",
  blogs: "Blogs",
  forums: "Forums & Q&A",
  podcasts: "Podcasts",
  video: "Video channels",
  social: "Social & microblogs",
  reference: "Reference, wikis & dictionaries",
  startup: "Startups, incubators & funding",
};

export type WorldCatalogSource = {
  key: string;
  name: string;
  /** Feed URL (always https). */
  url: string;
  /** `Source.type` */
  type: string;
  /** ISO 639 code, "" when the pack left it blank. */
  language: string;
  /** ISO 3166-1 alpha-2, "" for global / not confirmed. */
  country: string;
  group: WorldCatalogGroup;
  /** The pack's own XML check passed (not a guarantee of freshness). */
  verified: boolean;
};

const PACK_SOURCES: readonly WorldCatalogSource[] = WORLD_CATALOG_ROWS.map(
  ([id, name, url, country, language, type, group, verified]) => ({
    key: `world-${id}`,
    name,
    url,
    type,
    language,
    country,
    group: group as WorldCatalogGroup,
    verified: verified === 1,
  }),
);

/**
 * The startup / project-funding directories (6 Oct 2026): incubators, technology
 * parks, development agencies, funders and startup media. Feeds the directories list
 * are candidates like the rest; a feed another catalog already has counts once.
 */
const startupFeeds: WorldCatalogSource[] = (() => {
  const known = new Set([...TURKEY_SOURCE_CATALOG, ...PACK_SOURCES].map((entry) => feedIdentity(entry.url)));
  const out: WorldCatalogSource[] = [];
  for (const [name, url, country, language, type, verified] of STARTUP_FEED_ROWS) {
    const identity = feedIdentity(url);
    if (known.has(identity)) continue;
    known.add(identity);
    out.push({ key: `startup-${out.length + 1}`, name, url, type, language, country, group: "startup", verified: verified === 1 });
  }
  return out;
})();

export const WORLD_SOURCE_CATALOG: readonly WorldCatalogSource[] = [...PACK_SOURCES, ...startupFeeds];

export type StartupPageCandidate = {
  key: string;
  name: string;
  /** The organisation's web page — NOT a feed. A feed is looked for there before anything is stored. */
  url: string;
  type: string;
  language: string;
  country: string;
};

/**
 * Organisations the directories list with no RSS address. The background import
 * asks each page for a feed (robots.txt permitting) and adds the source only when
 * one reads; a page without a feed is left alone. A page on a host that already
 * has a catalog feed is left out.
 */
export const STARTUP_PAGE_CANDIDATES: readonly StartupPageCandidate[] = (() => {
  const knownHosts = new Set([...TURKEY_SOURCE_CATALOG, ...WORLD_SOURCE_CATALOG].map((entry) => new URL(entry.url).hostname.replace(/^www\./, "")));
  const seen = new Set<string>();
  const out: StartupPageCandidate[] = [];
  for (const [name, url, country, language, type] of STARTUP_PAGE_ROWS) {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (knownHosts.has(host) || seen.has(host)) continue;
    seen.add(host);
    out.push({ key: `startup-page-${out.length + 1}`, name, url, type, language, country });
  }
  return out;
})();
