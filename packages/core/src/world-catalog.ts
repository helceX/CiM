import { WORLD_CATALOG_ROWS } from "./world-catalog.generated";

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
  | "reference";

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

export const WORLD_SOURCE_CATALOG: readonly WorldCatalogSource[] = WORLD_CATALOG_ROWS.map(
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
