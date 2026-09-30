import type { ReportData } from "./gather-data";
import { REPORT_SECTION_LABELS, type ReportSectionKey } from "./sections";
import { getReportTemplate } from "./templates";

const SENTIMENT_BADGE: Record<string, string> = {
  positive: "background:oklch(52% 0.13 150 / 15%);color:oklch(38% 0.13 150);",
  neutral: "background:oklch(94% 0.005 260);color:oklch(25% 0.01 260);",
  negative: "background:oklch(52% 0.19 25 / 15%);color:oklch(42% 0.19 25);",
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function sentimentBadge(sentiment: string | null): string {
  const style = sentiment ? (SENTIMENT_BADGE[sentiment] ?? SENTIMENT_BADGE.neutral) : SENTIMENT_BADGE.neutral;
  const label = sentiment ?? "Unclassified";
  return `<span class="badge" style="${style}">${escapeHtml(label)}</span>`;
}

/** A plain sequential bar chart (one hue, magnitude only — dataviz skill's form heuristic) — no JS needed for a static PDF page. */
function volumeBarChart(series: ReportData["volumeSeries"]): string {
  if (series.length === 0) return `<p class="empty">No mentions in this period.</p>`;
  const max = Math.max(1, ...series.map((p) => p.count));
  const barWidth = 600 / series.length;
  const bars = series
    .map((point, i) => {
      const height = Math.round((point.count / max) * 80);
      const x = i * barWidth;
      const y = 90 - height;
      return `<rect x="${x + barWidth * 0.15}" y="${y}" width="${barWidth * 0.7}" height="${height}" rx="1" fill="oklch(38% 0.11 260)" />`;
    })
    .join("");
  const first = series[0]?.date ?? "";
  const last = series[series.length - 1]?.date ?? "";
  return `
    <svg viewBox="0 0 600 100" width="600" height="100" role="img" aria-label="Mention volume trend">
      <line x1="0" y1="90" x2="600" y2="90" stroke="oklch(90% 0.005 260)" stroke-width="1" />
      ${bars}
    </svg>
    <div class="chart-axis"><span>${escapeHtml(first)}</span><span>${escapeHtml(last)}</span></div>
  `;
}

function kpiRow(data: ReportData): string {
  const items: [string, string][] = [
    ["Total mentions", String(data.summary.totalMentions)],
    ["Unique sources", String(data.summary.uniqueSources)],
    ["High priority", String(data.summary.highPriority)],
    [
      "Sentiment mix",
      `${data.summary.positive} / ${data.summary.neutral} / ${data.summary.negative}`,
    ],
  ];
  return `<div class="kpi-row">${items
    .map(([label, value]) => `<div class="kpi"><div class="label">${escapeHtml(label)}</div><div class="value">${escapeHtml(value)}</div></div>`)
    .join("")}</div>`;
}

function sentimentSection(data: ReportData): string {
  if (data.sentimentSeries.every((p) => p.positive + p.neutral + p.negative + p.unclassified === 0)) {
    return `<p class="empty">No mentions in this period.</p>`;
  }
  const rows = data.sentimentSeries
    .map(
      (p) =>
        `<tr><td>${escapeHtml(p.date)}</td><td>${p.positive}</td><td>${p.neutral}</td><td>${p.negative}</td><td>${p.unclassified}</td></tr>`,
    )
    .join("");
  return `<table><thead><tr><th>Date</th><th>Positive</th><th>Neutral</th><th>Negative</th><th>Unclassified</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function sourceDistributionSection(data: ReportData): string {
  if (data.sourceDistribution.length === 0) return `<p class="empty">No mentions in this period.</p>`;
  const rows = data.sourceDistribution
    .map((row) => `<tr><td>${escapeHtml(row.sourceName)}</td><td>${row.count}</td></tr>`)
    .join("");
  return `<table><thead><tr><th>Source</th><th>Mentions</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function topStoriesSection(data: ReportData): string {
  if (data.topStories.length === 0) return `<p class="empty">No mentions in this period.</p>`;
  const rows = data.topStories
    .map(
      ({ mention, article, source }) =>
        `<tr><td>${escapeHtml(article.title)}</td><td>${escapeHtml(source.name)}</td><td>${sentimentBadge(mention.sentiment)}</td><td>${escapeHtml(mention.priority)}</td></tr>`,
    )
    .join("");
  return `<table><thead><tr><th>Headline</th><th>Source</th><th>Sentiment</th><th>Priority</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function topicsSection(data: ReportData): string {
  if (data.topicBreakdown.length === 0) return `<p class="empty">No monitoring queries in this period.</p>`;
  const rows = data.topicBreakdown
    .map(
      (row) =>
        `<tr><td>${escapeHtml(row.queryName)}</td><td>${row.currentCount}</td><td>${row.previousCount}</td></tr>`,
    )
    .join("");
  return `<table><thead><tr><th>Query</th><th>This period</th><th>Previous period</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function competitorsSection(data: ReportData): string {
  if (data.competitorComparison.length === 0) {
    return `<p class="empty">No company/competitor-tagged queries configured.</p>`;
  }
  const rows = data.competitorComparison
    .map(
      (row) =>
        `<tr><td>${escapeHtml(row.queryName)}</td><td>${escapeHtml(row.trackingTarget)}</td><td>${row.totalMentions}</td><td>${row.positive}/${row.neutral}/${row.negative}</td></tr>`,
    )
    .join("");
  return `<table><thead><tr><th>Query</th><th>Tracking</th><th>Mentions</th><th>Sentiment mix</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function aiInsightSection(data: ReportData): string {
  if (!data.insight) return `<p class="empty">Not available — no AI insight generated for this project yet.</p>`;
  return `
    <p>${escapeHtml(data.insight.summary)}</p>
    <p class="chart-axis">Confidence ${Math.round(Number(data.insight.confidence) * 100)}% · Method: ${escapeHtml(data.insight.method)} · Based on ${data.insight.evidence.length} mention${data.insight.evidence.length === 1 ? "" : "s"}</p>
  `;
}

function recommendationsSection(data: ReportData): string {
  if (data.recommendations.length === 0) {
    return `<p class="empty">Not available — no recommendations generated for this project yet.</p>`;
  }
  return data.recommendations
    .map(
      (item) => `
    <div style="margin-bottom: 12px;">
      <p><strong>${escapeHtml(item.summary)}</strong>${item.priority ? ` <span class="badge" style="background:oklch(94% 0.005 260);color:oklch(25% 0.01 260);">${escapeHtml(item.priority)} priority</span>` : ""}</p>
      ${item.why ? `<p>${escapeHtml(item.why)}</p>` : ""}
      <p class="chart-axis">Confidence ${Math.round(Number(item.confidence) * 100)}% · Method: ${escapeHtml(item.method)} · Based on ${item.evidence.length} mention${item.evidence.length === 1 ? "" : "s"}</p>
    </div>`,
    )
    .join("");
}

const CUSTOM_SECTION_RENDERERS: Record<ReportSectionKey, (data: ReportData) => string> = {
  trend: (data) => volumeBarChart(data.volumeSeries),
  sentiment: sentimentSection,
  sources: sourceDistributionSection,
  topics: topicsSection,
  top_stories: topStoriesSection,
  competitors: competitorsSection,
  ai_insight: aiInsightSection,
  recommendations: recommendationsSection,
};

function customSections(data: ReportData): string {
  const keys = data.sections ?? [];
  if (keys.length === 0) return `<p class="empty">No sections selected for this report.</p>`;
  return keys
    .map(
      (key) =>
        `<section><h2>${escapeHtml(REPORT_SECTION_LABELS[key])}</h2>${CUSTOM_SECTION_RENDERERS[key](data)}</section>`,
    )
    .join("");
}

/**
 * Renders the fixed-template report as a self-contained HTML document —
 * inline `<style>` using the same OKLCH design tokens as the app
 * (packages/ui/src/styles/tokens.css, light mode only, since print has no
 * dark-mode concept) so the exported PDF matches the product's actual
 * visual language (docs/ux/DESIGN_SYSTEM.md), not a generic report look.
 */
export function renderReportHtml(data: ReportData): string {
  const template = getReportTemplate(data.templateKey);
  const templateName = template?.name ?? data.templateKey;

  const sections =
    data.templateKey === "custom"
      ? customSections(data)
      : data.templateKey === "weekly_summary"
        ? `
        <section><h2>Mention trend</h2>${volumeBarChart(data.volumeSeries)}</section>
        <section><h2>Sentiment mix</h2>${sentimentSection(data)}</section>
        <section><h2>Top stories</h2>${topStoriesSection(data)}</section>
      `
        : `
        <section><h2>Mention trend</h2>${volumeBarChart(data.volumeSeries)}</section>
        <section><h2>Sentiment trend</h2>${sentimentSection(data)}</section>
        <section><h2>Source distribution</h2>${sourceDistributionSection(data)}</section>
        <section><h2>Top stories</h2>${topStoriesSection(data)}</section>
      `;

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; }
  body {
    font-family: "Inter", ui-sans-serif, system-ui, -apple-system, sans-serif;
    color: oklch(20% 0.01 260);
    background: oklch(100% 0 0);
    margin: 0;
    padding: 32px;
    font-size: 12px;
  }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .meta { color: oklch(48% 0.01 260); font-size: 11px; margin-bottom: 24px; }
  .kpi-row { display: flex; gap: 16px; margin-bottom: 28px; }
  .kpi { flex: 1; border: 1px solid oklch(90% 0.005 260); border-radius: 8px; padding: 12px; }
  .kpi .label { color: oklch(48% 0.01 260); font-size: 10px; text-transform: uppercase; letter-spacing: 0.03em; }
  .kpi .value { font-size: 20px; font-weight: 600; margin-top: 4px; }
  section { margin-bottom: 28px; }
  h2 { font-size: 13px; font-weight: 600; margin: 0 0 10px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid oklch(90% 0.005 260); }
  th { color: oklch(48% 0.01 260); font-weight: 500; text-transform: uppercase; font-size: 9px; }
  .badge { display: inline-block; padding: 1px 8px; border-radius: 4px; font-size: 10px; font-weight: 500; }
  .empty { color: oklch(48% 0.01 260); font-style: italic; }
  .chart-axis { display: flex; justify-content: space-between; font-size: 10px; color: oklch(48% 0.01 260); margin-top: 4px; }
  footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid oklch(90% 0.005 260); color: oklch(48% 0.01 260); font-size: 10px; }
</style>
</head>
<body>
  <h1>${escapeHtml(templateName)} — ${escapeHtml(data.projectName)}</h1>
  <p class="meta">${formatDate(data.periodStart)} to ${formatDate(data.periodEnd)}</p>
  ${kpiRow(data)}
  ${sections}
  <footer>Generated by CiM. All figures are aggregated directly from monitored mentions — no estimated or fabricated values.</footer>
</body>
</html>`;
}
