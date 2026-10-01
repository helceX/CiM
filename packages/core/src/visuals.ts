/**
 * docs/product/NEXT_FEATURES_SPEC.md §2 — pure vocabulary and helpers for the
 * chart & table builder. A visual is a declarative spec over a closed set of
 * measures and dimensions; nothing here (or in the spec) can carry SQL.
 */

export const VISUAL_MEASURES = ["mentions", "unique_sources", "high_priority", "negative_share"] as const;
export type VisualMeasure = (typeof VISUAL_MEASURES)[number];

export const VISUAL_DIMENSIONS = ["day", "week", "source", "source_type", "sentiment", "brand_group", "query"] as const;
export type VisualDimension = (typeof VISUAL_DIMENSIONS)[number];

export const VISUAL_KINDS = ["chart", "table"] as const;
export const VISUAL_CHART_TYPES = ["line", "bar", "stacked_bar", "area", "pie", "table"] as const;
export type VisualChartType = (typeof VISUAL_CHART_TYPES)[number];

export const VISUAL_PERIOD_DAYS = [7, 30, 90, 180, 365] as const;
export const VISUAL_MAX_ROWS = 1000;
export const VISUAL_PIE_MAX_SLICES = 6;
/** How many visuals can sit on the Dashboard at once. */
export const VISUAL_MAX_PINNED = 4;

export const MEASURE_LABELS: Record<VisualMeasure, string> = {
  mentions: "Mentions",
  unique_sources: "Unique sources",
  high_priority: "High-priority mentions",
  negative_share: "Negative share (%)",
};

export const DIMENSION_LABELS: Record<VisualDimension, string> = {
  day: "Day",
  week: "Week",
  source: "Source",
  source_type: "Source type",
  sentiment: "Sentiment",
  brand_group: "Brand group",
  query: "Monitoring query",
};

export const isTimeDimension = (dimension: VisualDimension) => dimension === "day" || dimension === "week";

/** Share measures are undefined (null), not zero, when nothing qualifies. */
export const isShareMeasure = (measure: VisualMeasure) => measure === "negative_share";

export type VisualRow = { label: string; value: number | null };

function addDays(date: Date, days: number): Date {
  const copy = new Date(date.getTime());
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

/** Monday of the ISO week containing `date` (UTC), matching Postgres date_trunc('week'). */
function startOfIsoWeek(date: Date): Date {
  const day = (date.getUTCDay() + 6) % 7;
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  return addDays(start, -day);
}

const isoDate = (date: Date) => date.toISOString().slice(0, 10);

/**
 * A trend with holes reads as a bug, so time buckets with no rows are
 * filled: 0 for counts, null for shares (undefined, not zero). Non-time
 * dimensions are returned untouched. `today` is injectable for tests.
 */
export function fillTimeBuckets(
  rows: VisualRow[],
  spec: { dimension: VisualDimension; measure: VisualMeasure; periodDays: number },
  today: Date = new Date(),
): VisualRow[] {
  if (!isTimeDimension(spec.dimension)) return rows;
  const byLabel = new Map(rows.map((row) => [row.label, row.value]));
  const fill = isShareMeasure(spec.measure) ? null : 0;
  const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const first = addDays(end, -spec.periodDays);
  const out: VisualRow[] = [];
  if (spec.dimension === "day") {
    for (let d = first; d <= end; d = addDays(d, 1)) {
      out.push({ label: isoDate(d), value: byLabel.get(isoDate(d)) ?? fill });
    }
  } else {
    for (let d = startOfIsoWeek(first); d <= end; d = addDays(d, 7)) {
      out.push({ label: isoDate(d), value: byLabel.get(isoDate(d)) ?? fill });
    }
  }
  return out;
}

/** Chart forms that suit a spec's data shape, best first; a table is always available. */
export function suggestChartTypes(spec: { dimension: VisualDimension; measure: VisualMeasure }, rowCount: number): VisualChartType[] {
  if (isTimeDimension(spec.dimension)) return ["line", "area", "bar", "table"];
  const suggestions: VisualChartType[] = ["bar"];
  // Parts of a whole only make sense for additive counts with few categories.
  if (spec.measure !== "unique_sources" && !isShareMeasure(spec.measure) && rowCount <= VISUAL_PIE_MAX_SLICES) {
    suggestions.push("pie");
  }
  suggestions.push("table");
  return suggestions;
}

/**
 * Labels are source names, query names and group names — text that can be
 * attacker-influenced (a source called `=HYPERLINK(...)`). Spreadsheet apps
 * evaluate a leading = + - @ as a formula (CWE-1236), so such cells get a
 * leading apostrophe, the same mitigation the report exports use.
 */
function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

/** RFC 4180 CSV (CRLF) of a computed visual; an undefined share is an empty cell, not 0. */
export function renderVisualCsv(
  rows: VisualRow[],
  spec: { measure: VisualMeasure; dimension: VisualDimension },
): string {
  const lines = [`${csvCell(DIMENSION_LABELS[spec.dimension])},${csvCell(MEASURE_LABELS[spec.measure])}`];
  for (const row of rows) {
    lines.push(`${csvCell(row.label)},${row.value === null ? "" : row.value}`);
  }
  return lines.join("\r\n") + "\r\n";
}

export type VisualHighlights = {
  /** Sum of the buckets — only for additive measures. */
  total: number | null;
  /** The biggest bucket (ties: the earliest). */
  peak: { label: string; value: number } | null;
  /** Mean per bucket that has a value — time series only. */
  average: number | null;
  /** The last bucket's value — time series only. */
  latest: number | null;
};

/**
 * The few numbers worth reading before the chart: the total, the peak, the
 * typical bucket, the latest one. "Unique sources" and shares are not
 * additive, so they get no total; a null bucket (undefined share) is
 * skipped, never counted as 0.
 */
export function summarizeVisualRows(
  rows: VisualRow[],
  spec: { measure: VisualMeasure; dimension: VisualDimension },
): VisualHighlights {
  const filled = rows.filter((row): row is { label: string; value: number } => row.value !== null);
  const additive = spec.measure === "mentions" || spec.measure === "high_priority";
  let peak: VisualHighlights["peak"] = null;
  for (const row of filled) if (!peak || row.value > peak.value) peak = { label: row.label, value: row.value };
  const time = isTimeDimension(spec.dimension);
  const sum = filled.reduce((acc, row) => acc + row.value, 0);
  return {
    total: additive && filled.length > 0 ? sum : null,
    peak,
    average: time && filled.length > 0 ? Math.round((sum / filled.length) * 10) / 10 : null,
    latest: time ? (rows.at(-1)?.value ?? null) : null,
  };
}
