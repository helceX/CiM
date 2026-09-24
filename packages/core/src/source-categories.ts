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
