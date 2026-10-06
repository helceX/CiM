import ExcelJS from "exceljs";
import { countryName, sourceTypeBadge } from "@cim/core";
import type { ArchiveMention } from "@cim/db";
import { sanitizeCellValue } from "../sanitize-cell";
import { safeHref } from "./render-archive-html";

/** The same mentions as a spreadsheet (one row each, with a clickable link) plus a one-sheet summary. */
export async function renderArchiveXlsx(input: { organizationName: string; periodLabel: string; mentions: ArchiveMention[] }): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Mediaory";

  const summary = workbook.addWorksheet("Summary");
  summary.columns = [
    { header: "Metric", key: "metric", width: 28 },
    { header: "Value", key: "value", width: 30 },
  ];
  summary.getRow(1).font = { bold: true };
  const count = (s: string) => input.mentions.filter((m) => m.sentiment === s).length;
  summary.addRows([
    { metric: "Organization", value: sanitizeCellValue(input.organizationName) },
    { metric: "Period", value: input.periodLabel },
    { metric: "Mentions", value: input.mentions.length },
    { metric: "Sources", value: new Set(input.mentions.map((m) => m.sourceName)).size },
    { metric: "Positive", value: count("positive") },
    { metric: "Neutral", value: count("neutral") },
    { metric: "Negative", value: count("negative") },
  ]);

  const sheet = workbook.addWorksheet("Mentions");
  sheet.columns = [
    { header: "Date", key: "date", width: 12 },
    { header: "Time (TR)", key: "time", width: 10 },
    { header: "Monitoring", key: "monitoring", width: 26 },
    { header: "Title", key: "title", width: 70 },
    { header: "Source", key: "source", width: 26 },
    { header: "Type", key: "type", width: 12 },
    { header: "Country", key: "country", width: 16 },
    { header: "Sentiment", key: "sentiment", width: 12 },
    { header: "Priority", key: "priority", width: 10 },
    { header: "Matched words", key: "terms", width: 28 },
    { header: "Tags", key: "tags", width: 22 },
    { header: "Link", key: "link", width: 40 },
    { header: "Excerpt", key: "excerpt", width: 80 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  for (const m of input.mentions) {
    const href = safeHref(m.url);
    sheet.addRow({
      date: m.day,
      time: m.occurredAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" }),
      monitoring: sanitizeCellValue(m.queryName),
      title: sanitizeCellValue(m.title),
      source: sanitizeCellValue(m.sourceName),
      type: sourceTypeBadge(m.sourceType),
      country: m.sourceCountry ? countryName(m.sourceCountry) : "",
      sentiment: m.sentiment ?? "",
      priority: m.priority,
      terms: sanitizeCellValue(m.matchedTerms.join(", ")),
      tags: sanitizeCellValue(m.tags.join(", ")),
      link: href ? { text: href, hyperlink: href } : "",
      excerpt: m.excerpt ? sanitizeCellValue(m.excerpt) : "",
    });
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
