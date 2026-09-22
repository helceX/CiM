/**
 * docs/product/USER_FLOWS.md §5 "Section builder: Overview/KPI/Trend/Top
 * Stories/Sources/Sentiment/Topics/Competitors/AI Insight/Recommendations
 * (reorderable)" — the custom-template report's section picker. Every key
 * here has a real, already-built data source behind it; "Recommendations"
 * is excluded on purpose (FEATURE_MATRIX.md P2, not implemented — a
 * section with nothing real to render would be exactly the fabricated-
 * looking output the AI Trust Layer exists to prevent).
 */
export const REPORT_SECTION_KEYS = [
  "trend",
  "sentiment",
  "sources",
  "topics",
  "top_stories",
  "competitors",
  "ai_insight",
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
};

export function isReportSectionKey(value: string): value is ReportSectionKey {
  return (REPORT_SECTION_KEYS as readonly string[]).includes(value);
}
