import ExcelJS from "exceljs";
import type { ReportData } from "./gather-data";

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function styleHeaderRow(row: ExcelJS.Row): void {
  row.font = { bold: true };
}

/**
 * docs/product/FEATURE_MATRIX.md P2 "Report builder (custom sections),
 * XLSX, sharing links" — this ships the XLSX slice: the same ReportData
 * the PDF/CSV renderers already read (never a parallel computation),
 * split across sheets a spreadsheet user actually wants — one flat CSV
 * table isn't enough once volume/sentiment trend and source distribution
 * exist as their own series, so each becomes its own sheet instead of
 * being flattened into one.
 */
export async function renderReportXlsx(data: ReportData): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();

  const summarySheet = workbook.addWorksheet("Summary");
  summarySheet.columns = [
    { header: "Metric", key: "metric", width: 28 },
    { header: "Value", key: "value", width: 20 },
  ];
  styleHeaderRow(summarySheet.getRow(1));
  summarySheet.addRows([
    { metric: "Project", value: data.projectName },
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

  const volumeSheet = workbook.addWorksheet("Mention Volume");
  volumeSheet.columns = [
    { header: "Date", key: "date", width: 14 },
    { header: "Mentions", key: "count", width: 12 },
  ];
  styleHeaderRow(volumeSheet.getRow(1));
  volumeSheet.addRows(
    data.volumeSeries.map((point) => ({ date: point.date, count: point.count })),
  );

  const sentimentSheet = workbook.addWorksheet("Sentiment Trend");
  sentimentSheet.columns = [
    { header: "Date", key: "date", width: 14 },
    { header: "Positive", key: "positive", width: 12 },
    { header: "Neutral", key: "neutral", width: 12 },
    { header: "Negative", key: "negative", width: 12 },
    { header: "Unclassified", key: "unclassified", width: 14 },
  ];
  styleHeaderRow(sentimentSheet.getRow(1));
  sentimentSheet.addRows(
    data.sentimentSeries.map((point) => ({
      date: point.date,
      positive: point.positive,
      neutral: point.neutral,
      negative: point.negative,
      unclassified: point.unclassified,
    })),
  );

  const sourcesSheet = workbook.addWorksheet("Source Distribution");
  sourcesSheet.columns = [
    { header: "Source", key: "sourceName", width: 28 },
    { header: "Mentions", key: "count", width: 12 },
  ];
  styleHeaderRow(sourcesSheet.getRow(1));
  sourcesSheet.addRows(
    data.sourceDistribution.map((row) => ({
      sourceName: row.sourceName,
      count: row.count,
    })),
  );

  const topStoriesSheet = workbook.addWorksheet("Top Stories");
  topStoriesSheet.columns = [
    { header: "Title", key: "title", width: 48 },
    { header: "Source", key: "source", width: 22 },
    { header: "Sentiment", key: "sentiment", width: 14 },
    { header: "Priority", key: "priority", width: 12 },
    { header: "Published", key: "published", width: 14 },
    { header: "URL", key: "url", width: 40 },
  ];
  styleHeaderRow(topStoriesSheet.getRow(1));
  topStoriesSheet.addRows(
    data.topStories.map(({ mention, article, source }) => ({
      title: article.title,
      source: source.name,
      sentiment: mention.sentiment ?? "Unclassified",
      priority: mention.priority,
      published: article.publishedAt ? formatDate(article.publishedAt) : "",
      url: article.canonicalUrl,
    })),
  );

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
