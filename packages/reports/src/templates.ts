export type ReportTemplateKey = "weekly_summary" | "monitoring_overview" | "custom";
export type ReportPeriodType = "rolling_7d" | "rolling_30d";

export type ReportTemplate = {
  key: ReportTemplateKey;
  name: string;
  description: string;
  defaultPeriodType: ReportPeriodType;
};

/**
 * docs/product/FEATURE_MATRIX.md — MVP shipped two fixed templates
 * (hardcoded section lists, docs/product/USER_FLOWS.md §5); "custom" adds
 * the reorderable section builder (`sections.ts`) on top — a Report with
 * `templateKey: "custom"` reads its section list from `reports.sections`
 * (packages/db/src/schema/reports.ts) instead of a hardcoded list here.
 */
export const REPORT_TEMPLATES: ReportTemplate[] = [
  {
    key: "weekly_summary",
    name: "Weekly Summary",
    description: "KPIs, mention trend, sentiment mix, and top stories for the last 7 days.",
    defaultPeriodType: "rolling_7d",
  },
  {
    key: "monitoring_overview",
    name: "Monitoring Overview",
    description: "A broader 30-day view: KPIs, sentiment trend, source distribution, and top stories.",
    defaultPeriodType: "rolling_30d",
  },
  {
    key: "custom",
    name: "Custom",
    description: "Choose and reorder the sections that go in the report.",
    defaultPeriodType: "rolling_7d",
  },
];

export function getReportTemplate(key: string): ReportTemplate | undefined {
  return REPORT_TEMPLATES.find((t) => t.key === key);
}

export function periodTypeToSinceDays(periodType: string): number {
  return periodType === "rolling_30d" ? 30 : 7;
}

/**
 * The single place "sinceDays -> {periodStart, periodEnd}" is computed —
 * every call site that creates a ReportRun (POST /api/reports, "run again",
 * the scheduled-reports job) needs the exact same computation, since a
 * ReportRun's stored periodStart/periodEnd is read back later (the report
 * header, gatherReportData) and must reflect what was actually requested at
 * enqueue time, not a second, possibly-different "now" computed elsewhere.
 */
export function periodTypeToRange(periodType: string): {
  sinceDays: number;
  periodStart: Date;
  periodEnd: Date;
} {
  const sinceDays = periodTypeToSinceDays(periodType);
  const periodEnd = new Date();
  const periodStart = new Date(periodEnd.getTime() - sinceDays * 24 * 60 * 60 * 1000);
  return { sinceDays, periodStart, periodEnd };
}
