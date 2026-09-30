/**
 * docs/product/USER_FLOWS.md §5 "Section builder: Overview/KPI/Trend/Top
 * Stories/Sources/Sentiment/Topics/Competitors/AI Insight/Recommendations
 * (reorderable)" — the custom-template report's section picker. Every key
 * here has a real, already-built data source behind it — "recommendations"
 * joined once AIProvider.generateRecommendations shipped (FEATURE_MATRIX.md
 * P2), completing this list.
 */
export const REPORT_SECTION_KEYS = [
  "trend",
  "sentiment",
  "sources",
  "topics",
  "top_stories",
  "competitors",
  "ai_insight",
  "recommendations",
] as const;

export type ReportSectionKey = (typeof REPORT_SECTION_KEYS)[number];

export const REPORT_SECTION_LABELS: Record<ReportSectionKey, string> = {
  trend: "Mention trend",
  sentiment: "Sentiment trend",
  sources: "Source distribution",
  topics: "Topics",
  top_stories: "Top stories",
  competitors: "Competitor comparison",
  ai_insight: "AI insight",
  recommendations: "Recommendations",
};

export function isReportSectionKey(value: string): value is ReportSectionKey {
  return (REPORT_SECTION_KEYS as readonly string[]).includes(value);
}

/**
 * A custom report can also include saved visuals (docs/product/NEXT_FEATURES_SPEC.md §2).
 * They share the ordered `sections` list as `visual:<uuid>`; the id is always
 * re-resolved against the report's organization when the report is generated.
 */
export type VisualSectionKey = `visual:${string}`;
export type ReportSection = ReportSectionKey | VisualSectionKey;

const VISUAL_SECTION = /^visual:([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/;

export function isVisualSectionKey(value: string): value is VisualSectionKey {
  return VISUAL_SECTION.test(value);
}

export function visualIdFromSection(key: VisualSectionKey): string {
  return key.slice("visual:".length);
}

export function isReportSection(value: string): value is ReportSection {
  return isReportSectionKey(value) || isVisualSectionKey(value);
}
