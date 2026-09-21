export type ReportTemplateKey = "weekly_summary" | "monitoring_overview";
export type ReportPeriodType = "rolling_7d" | "rolling_30d";

export type ReportTemplate = {
  key: ReportTemplateKey;
  name: string;
  description: string;
  defaultPeriodType: ReportPeriodType;
};

/**
 * docs/product/FEATURE_MATRIX.md — MVP ships "fixed templates, PDF/CSV
 * export"; a reorderable custom section builder is P2. Each template is a
 * fixed, hardcoded section list — adding a template is a code change, not
 * a data-driven builder, and that's the deliberate, honest MVP scope.
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
];

export function getReportTemplate(key: string): ReportTemplate | undefined {
  return REPORT_TEMPLATES.find((t) => t.key === key);
}

export function periodTypeToSinceDays(periodType: string): number {
  return periodType === "rolling_30d" ? 30 : 7;
}
