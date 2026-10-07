import ExcelJS from "exceljs";
import type { ReportData } from "./gather-data";
import { DIMENSION_LABELS, MEASURE_LABELS } from "@cim/core";
import { isVisualSectionKey, type ReportSectionKey } from "./sections";
import type { ReportVisual } from "./gather-data";
import { sanitizeCellValue } from "./sanitize-cell";
import { addLogo, brandWorkbook, finishSheet } from "./xlsx-style";

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Headers are styled for every sheet at the end (finishSheet); kept as a no-op marker where the sheets declare them. */
function styleHeaderRow(_row: ExcelJS.Row): void {}

function addSummarySheet(workbook: ExcelJS.Workbook, data: ReportData): void {
  const sheet = workbook.addWorksheet("Summary");
  sheet.columns = [
    { header: "Metric", key: "metric", width: 28 },
    { header: "Value", key: "value", width: 20 },
  ];
  styleHeaderRow(sheet.getRow(1));
  sheet.addRows([
    { metric: "Project", value: sanitizeCellValue(data.projectName) },
    {
      metric: "Period",
      value: `${formatDate(data.periodStart)} to ${formatDate(data.periodEnd)}`,
    },
    { metric: "Total mentions", value: data.summary.totalMentions },
    { metric: "Unique sources", value: data.summary.uniqueSources },
    { metric: "Positive", value: data.summary.positive },
    { metric: "Neutral", value: data.summary.neutral },
    { metric: "Negative", value: data.summary.negative },
    { metric: "Unclassified", value: data.summary.unclassified },
    { metric: "High priority", value: data.summary.highPriority },
  ]);
}

function addTrendSheet(workbook: ExcelJS.Workbook, data: ReportData): void {
  const sheet = workbook.addWorksheet("Mention Volume");
  sheet.columns = [
    { header: "Date", key: "date", width: 14 },
    { header: "Mentions", key: "count", width: 12 },
  ];
  styleHeaderRow(sheet.getRow(1));
  sheet.addRows(
    data.volumeSeries.map((point) => ({ date: point.date, count: point.count })),
  );
}

function addSentimentSheet(workbook: ExcelJS.Workbook, data: ReportData): void {
  const sheet = workbook.addWorksheet("Sentiment Trend");
  sheet.columns = [
    { header: "Date", key: "date", width: 14 },
    { header: "Positive", key: "positive", width: 12 },
    { header: "Neutral", key: "neutral", width: 12 },
    { header: "Negative", key: "negative", width: 12 },
    { header: "Unclassified", key: "unclassified", width: 14 },
  ];
  styleHeaderRow(sheet.getRow(1));
  sheet.addRows(
    data.sentimentSeries.map((point) => ({
      date: point.date,
      positive: point.positive,
      neutral: point.neutral,
      negative: point.negative,
      unclassified: point.unclassified,
    })),
  );
}

function addSourcesSheet(workbook: ExcelJS.Workbook, data: ReportData): void {
  const sheet = workbook.addWorksheet("Source Distribution");
  sheet.columns = [
    { header: "Source", key: "sourceName", width: 28 },
    { header: "Mentions", key: "count", width: 12 },
  ];
  styleHeaderRow(sheet.getRow(1));
  sheet.addRows(
    data.sourceDistribution.map((row) => ({
      sourceName: sanitizeCellValue(row.sourceName),
      count: row.count,
    })),
  );
}

function addTopStoriesSheet(workbook: ExcelJS.Workbook, data: ReportData): void {
  const sheet = workbook.addWorksheet("Top Stories");
  sheet.columns = [
    { header: "Title", key: "title", width: 48 },
    { header: "Source", key: "source", width: 22 },
    { header: "Sentiment", key: "sentiment", width: 14 },
    { header: "Priority", key: "priority", width: 12 },
    { header: "Published", key: "published", width: 14 },
    { header: "URL", key: "url", width: 40 },
  ];
  styleHeaderRow(sheet.getRow(1));
  sheet.addRows(
    data.topStories.map(({ mention, article, source }) => ({
      title: sanitizeCellValue(article.title),
      source: sanitizeCellValue(source.name),
      sentiment: mention.sentiment ?? "Unclassified",
      priority: mention.priority,
      published: article.publishedAt ? formatDate(article.publishedAt) : "",
      url: sanitizeCellValue(article.canonicalUrl),
    })),
  );
}

function addTopicsSheet(workbook: ExcelJS.Workbook, data: ReportData): void {
  const sheet = workbook.addWorksheet("Topics");
  sheet.columns = [
    { header: "Query", key: "queryName", width: 28 },
    { header: "This period", key: "currentCount", width: 14 },
    { header: "Previous period", key: "previousCount", width: 16 },
  ];
  styleHeaderRow(sheet.getRow(1));
  sheet.addRows(
    data.topicBreakdown.map((row) => ({
      queryName: sanitizeCellValue(row.queryName),
      currentCount: row.currentCount,
      previousCount: row.previousCount,
    })),
  );
}

function addCompetitorsSheet(workbook: ExcelJS.Workbook, data: ReportData): void {
  const sheet = workbook.addWorksheet("Competitor Comparison");
  sheet.columns = [
    { header: "Query", key: "queryName", width: 28 },
    { header: "Tracking", key: "trackingTarget", width: 16 },
    { header: "Mentions", key: "totalMentions", width: 12 },
    { header: "Positive", key: "positive", width: 12 },
    { header: "Neutral", key: "neutral", width: 12 },
    { header: "Negative", key: "negative", width: 12 },
  ];
  styleHeaderRow(sheet.getRow(1));
  sheet.addRows(
    data.competitorComparison.map((row) => ({
      queryName: sanitizeCellValue(row.queryName),
      trackingTarget: row.trackingTarget,
      totalMentions: row.totalMentions,
      positive: row.positive,
      neutral: row.neutral,
      negative: row.negative,
    })),
  );
}

function addAiInsightSheet(workbook: ExcelJS.Workbook, data: ReportData): void {
  const sheet = workbook.addWorksheet("AI Insight");
  sheet.columns = [
    { header: "Field", key: "field", width: 20 },
    { header: "Value", key: "value", width: 70 },
  ];
  styleHeaderRow(sheet.getRow(1));
  if (!data.insight) {
    sheet.addRow({
      field: "Status",
      value: "Not available — no AI insight generated for this project yet.",
    });
    return;
  }
  sheet.addRows([
    { field: "Summary", value: sanitizeCellValue(data.insight.summary) },
    {
      field: "Confidence",
      value: `${Math.round(Number(data.insight.confidence) * 100)}%`,
    },
    { field: "Method", value: data.insight.method },
    { field: "Evidence mentions", value: data.insight.evidence.length },
  ]);
}

function addRecommendationsSheet(workbook: ExcelJS.Workbook, data: ReportData): void {
  const sheet = workbook.addWorksheet("Recommendations");
  sheet.columns = [
    { header: "Recommendation", key: "recommendation", width: 40 },
    { header: "Why", key: "why", width: 50 },
    { header: "Priority", key: "priority", width: 12 },
    { header: "Confidence", key: "confidence", width: 12 },
    { header: "Evidence mentions", key: "evidence", width: 16 },
  ];
  styleHeaderRow(sheet.getRow(1));
  if (data.recommendations.length === 0) {
    sheet.addRow({
      recommendation:
        "Not available — no recommendations generated for this project yet.",
    });
    return;
  }
  sheet.addRows(
    data.recommendations.map((item) => ({
      recommendation: sanitizeCellValue(item.summary),
      why: item.why ? sanitizeCellValue(item.why) : "",
      priority: item.priority ?? "",
      confidence: `${Math.round(Number(item.confidence) * 100)}%`,
      evidence: item.evidence.length,
    })),
  );
}

/** Excel forbids these in sheet names and caps them at 31 characters; names must also be unique. */
function visualSheetName(workbook: ExcelJS.Workbook, name: string): string {
  const base = `Visual - ${name}`.replace(/[\\/?*[\]:]/g, " ").replace(/\s+/g, " ").trim().slice(0, 31) || "Visual";
  let candidate = base;
  for (let n = 2; workbook.getWorksheet(candidate); n += 1) {
    candidate = `${base.slice(0, 31 - String(n).length - 1)} ${n}`;
  }
  return candidate;
}

/** Labels are external text (source names…): neutralise leading formula characters like the other sheets do. */
function addVisualSheet(workbook: ExcelJS.Workbook, visual: ReportVisual): void {
  const sheet = workbook.addWorksheet(visualSheetName(workbook, visual.name));
  if (!visual.rows || !visual.measure || !visual.dimension) {
    sheet.addRow(["Not available — this visual could not be produced."]);
    return;
  }
  sheet.columns = [
    { header: DIMENSION_LABELS[visual.dimension], key: "label", width: 32 },
    { header: MEASURE_LABELS[visual.measure], key: "value", width: 18 },
  ];
  styleHeaderRow(sheet.getRow(1));
  sheet.addRows(visual.rows.map((row) => ({ label: sanitizeCellValue(row.label), value: row.value })));
  // Real numbers with a number format (thousands separator, % for shares), right-aligned like a table in the app.
  const valueColumn = sheet.getColumn("value");
  valueColumn.numFmt = visual.measure === "negative_share" ? '0.0"%"' : "#,##0";
  valueColumn.alignment = { horizontal: "right" };
}

const SECTION_SHEET_BUILDERS: Record<
  ReportSectionKey,
  (workbook: ExcelJS.Workbook, data: ReportData) => void
> = {
  trend: addTrendSheet,
  sentiment: addSentimentSheet,
  sources: addSourcesSheet,
  topics: addTopicsSheet,
  top_stories: addTopStoriesSheet,
  competitors: addCompetitorsSheet,
  ai_insight: addAiInsightSheet,
  recommendations: addRecommendationsSheet,
};

// The same per-template section list render-html.ts uses (weekly_summary/
// monitoring_overview are hardcoded there too) — kept in sync by hand since
// neither renderer imports the other's list, the same way their HTML/XLSX
// section content already duplicates the same ReportData fields.
const FIXED_TEMPLATE_SECTIONS: Record<
  "weekly_summary" | "monitoring_overview",
  ReportSectionKey[]
> = {
  weekly_summary: ["trend", "sentiment", "top_stories"],
  monitoring_overview: ["trend", "sentiment", "sources", "top_stories"],
};

/**
 * docs/product/FEATURE_MATRIX.md P2 "Report builder (custom sections),
 * XLSX, sharing links" — this ships the XLSX slice: the same ReportData
 * the PDF/CSV renderers already read (never a parallel computation),
 * split across sheets a spreadsheet user actually wants — one flat CSV
 * table isn't enough once volume/sentiment trend and source distribution
 * exist as their own series, so each becomes its own sheet instead of
 * being flattened into one.
 *
 * Mirrors render-html.ts's per-template section selection: a "custom"
 * report gets exactly the sheets in `data.sections` (chosen by the user),
 * not the fixed sheet set every report previously got regardless of
 * template or section choice.
 */
export async function renderReportXlsx(data: ReportData): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  brandWorkbook(workbook, `Mediaory report — ${data.projectName}`);

  addSummarySheet(workbook, data);

  const sections =
    data.templateKey === "custom"
      ? (data.sections ?? [])
      : FIXED_TEMPLATE_SECTIONS[data.templateKey];

  for (const key of sections) {
    if (isVisualSectionKey(key)) {
      const visual = data.visuals[key];
      if (visual) addVisualSheet(workbook, visual);
      continue;
    }
    SECTION_SHEET_BUILDERS[key](workbook, data);
  }

  for (const sheet of workbook.worksheets) finishSheet(sheet, { filter: sheet.name !== "Summary" });
  const summary = workbook.getWorksheet("Summary");
  if (summary) addLogo(workbook, summary, 3);

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}


/**
 * A workbook for one saved visual (the "Export Excel" on a visual's page): the numbers as a real table,
 * and — when a picture is supplied — the chart exactly as the dashboard shows it, placed beside the table.
 */
export async function renderVisualXlsx(
  visual: ReportVisual,
  options: { chartPng?: { data: Buffer; width: number; height: number } } = {},
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  brandWorkbook(workbook, `Mediaory — ${visual.name}`);
  addVisualSheet(workbook, visual);
  for (const sheet of workbook.worksheets) finishSheet(sheet);
  const sheet = workbook.worksheets[0];
  if (sheet && options.chartPng) {
    const id = workbook.addImage({ base64: options.chartPng.data.toString("base64"), extension: "png" });
    const width = 760;
    sheet.addImage(id, { tl: { col: 3, row: 0.4 }, ext: { width, height: Math.round((options.chartPng.height / options.chartPng.width) * width) } });
    sheet.getColumn(3).width = 4; // a gutter between the table and the picture
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
