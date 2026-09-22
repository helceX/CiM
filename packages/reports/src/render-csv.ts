import type { ReportData } from "./gather-data";
import { sanitizeCellValue } from "./sanitize-cell";

function csvCell(value: string): string {
  return `"${sanitizeCellValue(value).replace(/"/g, '""')}"`;
}

/**
 * The mentions the report's "top stories" section lists, as CSV — no
 * external dependency needed for six plain columns (RFC 4180 quoting by
 * hand: double every embedded quote, quote every field).
 */
export function renderReportCsv(data: ReportData): string {
  const header = ["Title", "Source", "Sentiment", "Priority", "Published", "URL"];
  const lines = [header.map(csvCell).join(",")];

  for (const { mention, article, source } of data.topStories) {
    lines.push(
      [
        article.title,
        source.name,
        mention.sentiment ?? "Unclassified",
        mention.priority,
        article.publishedAt ? article.publishedAt.toISOString() : "",
        article.canonicalUrl,
      ]
        .map((value) => csvCell(String(value)))
        .join(","),
    );
  }

  return lines.join("\r\n");
}
