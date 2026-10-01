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
  news: ["news", "press"],
  web: ["website", "blog"],
  social: ["social"],
  video: ["youtube", "tv"],
  podcast: ["podcast"],
  forums: ["forum"],
  comments: ["comments"],
  all: [
    "news",
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

/**
 * How the admin groups `Source.type` values into the kinds of place a story
 * comes from — news sites, blogs, forums, social, audio/video, feeds. One
 * place so the Sources screen's filters and clusters always agree.
 */
export const SOURCE_KINDS = [
  { key: "news", label: "News sites", types: ["news", "press", "tv", "radio"] },
  { key: "blogs", label: "Blogs & websites", types: ["blog", "website"] },
  { key: "forums", label: "Forums & comments", types: ["forum", "comments"] },
  { key: "social", label: "Social", types: ["social"] },
  { key: "media", label: "Video & podcasts", types: ["youtube", "podcast"] },
  { key: "feeds", label: "Feeds, APIs & other", types: ["rss", "api", "other"] },
] as const;
export type SourceKindKey = (typeof SOURCE_KINDS)[number]["key"];

export function sourceKindOfType(type: string): SourceKindKey {
  return SOURCE_KINDS.find((kind) => (kind.types as readonly string[]).includes(type))?.key ?? "feeds";
}

export function sourceKindLabel(key: string): string {
  return SOURCE_KINDS.find((kind) => kind.key === key)?.label ?? key;
}
