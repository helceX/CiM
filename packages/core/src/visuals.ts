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
