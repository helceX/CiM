/**
 * Two source vocabularies exist by design: the user-facing category
 * (onboarding, monitoring UI — brief §6/§12, matches
 * @cim/validation's sourceTypeSelectionSchema) and the technical
 * `Source.type` enum ingestion actually matches against
 * (docs/architecture/DATA_MODEL.md). This is the one place that maps
 * between them, so a `MonitoringQuery.sourceTypes` column always stores
 * real `Source.type` values — the ingestion pipeline's `= any()` check
 * (packages/db/repositories/monitoring-queries.ts) never has to guess.
 */
export const SOURCE_CATEGORY_TO_SOURCE_TYPES: Record<string, readonly string[]> = {
  news: ["news", "press", "newspaper", "magazine"],
  web: ["website", "blog"],
  social: ["social"],
  video: ["youtube", "tv"],
  podcast: ["podcast"],
  forums: ["forum"],
  comments: ["comments"],
  trends: ["trends"],
  all: [
    "news",
    "newspaper",
    "magazine",
    "website",
    "blog",
    "press",
    "tv",
    "radio",
    "podcast",
    "youtube",
    "social",
    "forum",
    "comments",
    "rss",
    "api",
    "other",
    "trends",
  ],
};

export function expandSourceCategoriesToTypes(categories: string[]): string[] {
  const expanded = new Set<string>();
  for (const category of categories) {
    for (const type of SOURCE_CATEGORY_TO_SOURCE_TYPES[category] ?? []) {
      expanded.add(type);
    }
  }
  return [...expanded];
}

/** The inverse of {@link expandSourceCategoriesToTypes}: the categories whose source types a monitoring stores. */
export function collapseTypesToCategories(types: readonly string[]): string[] {
  const stored = new Set(types);
  return Object.entries(SOURCE_CATEGORY_TO_SOURCE_TYPES)
    .filter(([category, categoryTypes]) => category !== "all" && categoryTypes.some((type) => stored.has(type)))
    .map(([category]) => category);
}

/**
 * How the admin groups `Source.type` values into the kinds of place a story
 * comes from — news sites, blogs, forums, social, audio/video, feeds. One
 * place so the Sources screen's filters and clusters always agree.
 */
export const SOURCE_KINDS = [
  // One cluster for all of the press: digital news sites, agencies, printed
  // newspapers and magazines sit together, each carrying its own badge.
  { key: "news", label: "News & press", types: ["news", "press", "newspaper", "magazine"] },
  { key: "blogs", label: "Blogs & websites", types: ["blog", "website"] },
  { key: "forums", label: "Forums & comments", types: ["forum", "comments"] },
  { key: "social", label: "Social", types: ["social"] },
  { key: "media", label: "TV, radio, video & podcasts", types: ["tv", "radio", "youtube", "podcast"] },
  { key: "feeds", label: "Feeds, APIs & other", types: ["rss", "api", "other", "trends"] },
] as const;
export type SourceKindKey = (typeof SOURCE_KINDS)[number]["key"];

export function sourceKindOfType(type: string): SourceKindKey {
  return SOURCE_KINDS.find((kind) => (kind.types as readonly string[]).includes(type))?.key ?? "feeds";
}

export function sourceKindLabel(key: string): string {
  return SOURCE_KINDS.find((kind) => kind.key === key)?.label ?? key;
}

/**
 * The marker shown next to a story so you can tell at a glance what kind of
 * place it came from — "Digital news", "Newspaper", "Magazine" … Print titles
 * (newspaper, magazine) are the ones that can carry a scanned page.
 */
export const SOURCE_TYPE_BADGES: Record<string, string> = {
  news: "Digital news",
  press: "News agency",
  newspaper: "Newspaper",
  magazine: "Magazine",
  blog: "Blog",
  website: "Website",
  forum: "Forum",
  comments: "Comments",
  social: "Social",
  youtube: "YouTube",
  podcast: "Podcast",
  tv: "TV",
  radio: "Radio",
  rss: "Feed",
  api: "Feed",
  other: "Other",
  trends: "Google Trends",
};

export function sourceTypeBadge(type: string): string {
  return SOURCE_TYPE_BADGES[type] ?? "Other";
}

/** Source types whose stories may come from the printed edition. */
export const PRINT_CAPABLE_TYPES = ["newspaper", "magazine"] as const;
