import {
  BRAND_GROUP_COLORS,
  DIMENSION_LABELS,
  MEASURE_LABELS,
  VISUAL_PIE_MAX_SLICES,
  isTimeDimension,
  summarizeVisualRows,
  type VisualChartType,
  type VisualDimension,
  type VisualMeasure,
  type VisualRow,
} from "@cim/core";
import { BRAND, BRAND_LOGO_DATA_URI, BRAND_LOGO_LIGHT_DATA_URI } from "./brand";

export type VisualExportInput = {
  name: string;
  rows: VisualRow[];
  measure: VisualMeasure;
  dimension: VisualDimension;
  periodDays: number;
  chartType: VisualChartType;
};
export type VisualTheme = "dark" | "light";

const WIDTH = 1000;
const PAD = 32;
const INNER = WIDTH - PAD * 2;

const THEMES = {
  dark: { bg: "#0e1020", panel: "#151833", border: "#2a2f55", text: "#eef0f8", muted: "#9aa2c0", grid: "#2a2f50", track: "#1d2142", logo: BRAND_LOGO_LIGHT_DATA_URI },
  light: { bg: "#f5f7fc", panel: "#ffffff", border: "#e3e6f0", text: "#05051a", muted: "#5b6275", grid: "#e3e6f0", track: "#eef1f8", logo: BRAND_LOGO_DATA_URI },
} as const;

/** The dashboard's categorical hues, in the same fixed order (dark-theme steps). */
const GROUP_HEX: Record<string, string> = {
  blue: "#3987e5",
  orange: "#d95926",
  aqua: "#199e70",
  yellow: "#c98500",
  magenta: "#d55181",
  green: "#1fa31f",
  violet: "#9085e9",
  red: "#e66767",
};
const SIGNAL_FROM = "#7b5cff";
const SIGNAL_TO = "#ff4fa3";

function esc(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fmt(value: number | null, measure: VisualMeasure): string {
  if (value === null) return "—";
  return measure === "negative_share" ? `${value}%` : value.toLocaleString("en-US");
}

function shortDate(label: string): string {
  const date = new Date(`${label}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? label : date.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** A round upper bound and ticks for a value axis. */
function niceScale(max: number): { top: number; ticks: number[] } {
  if (max <= 0) return { top: 1, ticks: [0, 1] };
  const exponent = Math.floor(Math.log10(max));
  const base = 10 ** exponent;
  const step = [1, 2, 2.5, 5, 10].map((m) => m * base).find((s) => max / s <= 5) ?? 10 * base;
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + step / 1000; v += step) ticks.push(Math.round(v * 100) / 100);
  return { top, ticks };
}

function defs(prefix: string): string {
  return `<defs>
    <linearGradient id="${prefix}-stroke" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="${SIGNAL_FROM}"/><stop offset="100%" stop-color="${SIGNAL_TO}"/></linearGradient>
    <linearGradient id="${prefix}-hbar" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="${SIGNAL_FROM}"/><stop offset="100%" stop-color="${SIGNAL_TO}"/></linearGradient>
    <linearGradient id="${prefix}-bar" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${SIGNAL_TO}"/><stop offset="100%" stop-color="${SIGNAL_FROM}"/></linearGradient>
    <linearGradient id="${prefix}-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${SIGNAL_FROM}" stop-opacity=".38"/><stop offset="60%" stop-color="${SIGNAL_TO}" stop-opacity=".1"/><stop offset="100%" stop-color="${SIGNAL_TO}" stop-opacity="0"/></linearGradient>
    <linearGradient id="${prefix}-brand" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="${BRAND.violet}"/><stop offset="55%" stop-color="${BRAND.blue}"/><stop offset="100%" stop-color="${BRAND.cyan}"/></linearGradient>
  </defs>`;
}

type Plot = { svg: string; height: number };
type Ctx = VisualExportInput & { theme: (typeof THEMES)[VisualTheme]; prefix: string };

/** Categories read best as ranked horizontal bars with the value at the end. */
function horizontalBars(ctx: Ctx): Plot {
  const { rows, measure, theme, prefix } = ctx;
  const rowH = 38;
  const labelW = 210;
  const valueW = 70;
  const barX = PAD + labelW;
  const barW = INNER - labelW - valueW;
  const max = Math.max(1, ...rows.map((r) => r.value ?? 0));
  const body = rows
    .map((row, i) => {
      const y = i * rowH;
      const w = Math.max(row.value ? 4 : 0, ((row.value ?? 0) / max) * barW);
      return `<text x="${PAD}" y="${y + 23}" font-size="13" fill="${theme.text}">${esc(truncate(row.label, 28))}</text>
      <rect x="${barX}" y="${y + 8}" width="${barW}" height="20" rx="10" fill="${theme.track}"/>
      <rect x="${barX}" y="${y + 8}" width="${w.toFixed(1)}" height="20" rx="10" fill="url(#${prefix}-hbar)"/>
      <text x="${barX + barW + 12}" y="${y + 23}" font-size="13" font-weight="700" fill="${theme.text}">${esc(fmt(row.value, measure))}</text>`;
    })
    .join("");
  return { svg: body, height: rows.length * rowH + 6 };
}

/** Time buckets: columns, with a value axis and light grid. */
function verticalBars(ctx: Ctx): Plot {
  const { rows, measure, theme, prefix } = ctx;
  const plotH = 260;
  const left = PAD + 40;
  const plotW = INNER - 40;
  const { top, ticks } = niceScale(Math.max(0, ...rows.map((r) => r.value ?? 0)));
  const slot = plotW / rows.length;
  const barW = Math.min(36, slot * 0.64);
  const grid = ticks
    .map((tick) => {
      const y = plotH - (tick / top) * plotH;
      return `<line x1="${left}" y1="${y.toFixed(1)}" x2="${left + plotW}" y2="${y.toFixed(1)}" stroke="${theme.grid}" stroke-dasharray="3 5"/><text x="${left - 8}" y="${(y + 4).toFixed(1)}" font-size="11" text-anchor="end" fill="${theme.muted}">${esc(fmt(tick, measure))}</text>`;
    })
    .join("");
  const everyOther = Math.ceil(rows.length / 12);
  const bars = rows
    .map((row, i) => {
      const h = ((row.value ?? 0) / top) * plotH;
      const x = left + i * slot + (slot - barW) / 2;
      const label = i % everyOther === 0 ? `<text x="${(x + barW / 2).toFixed(1)}" y="${plotH + 20}" font-size="11" text-anchor="middle" fill="${theme.muted}">${esc(shortDate(row.label))}</text>` : "";
      const value = rows.length <= 14 && row.value !== null ? `<text x="${(x + barW / 2).toFixed(1)}" y="${(plotH - h - 6).toFixed(1)}" font-size="11" font-weight="700" text-anchor="middle" fill="${theme.text}">${esc(fmt(row.value, measure))}</text>` : "";
      return `<rect x="${x.toFixed(1)}" y="${(plotH - h).toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(0, h).toFixed(1)}" rx="6" fill="url(#${prefix}-bar)"/>${value}${label}`;
    })
    .join("");
  return { svg: `${grid}${bars}`, height: plotH + 34 };
}

function lineOrArea(ctx: Ctx, area: boolean): Plot {
  const { rows, measure, theme, prefix } = ctx;
  const plotH = 260;
  const left = PAD + 40;
  const plotW = INNER - 40;
  const { top, ticks } = niceScale(Math.max(0, ...rows.map((r) => r.value ?? 0)));
  const step = rows.length > 1 ? plotW / (rows.length - 1) : 0;
  const point = (i: number, v: number) => `${(left + (rows.length > 1 ? i * step : plotW / 2)).toFixed(1)},${(plotH - (v / top) * plotH).toFixed(1)}`;
  const grid = ticks
    .map((tick) => {
      const y = plotH - (tick / top) * plotH;
      return `<line x1="${left}" y1="${y.toFixed(1)}" x2="${left + plotW}" y2="${y.toFixed(1)}" stroke="${theme.grid}" stroke-dasharray="3 5"/><text x="${left - 8}" y="${(y + 4).toFixed(1)}" font-size="11" text-anchor="end" fill="${theme.muted}">${esc(fmt(tick, measure))}</text>`;
    })
    .join("");
  // A null (undefined share) breaks the line instead of drawing zero.
  const segments: { i: number; v: number }[][] = [];
  let current: { i: number; v: number }[] = [];
  rows.forEach((row, i) => {
    if (row.value === null) {
      if (current.length > 0) segments.push(current);
      current = [];
    } else current.push({ i, v: row.value });
  });
  if (current.length > 0) segments.push(current);
  const paths = segments
    .map((segment) => {
      const d = segment.map(({ i, v }, k) => `${k === 0 ? "M" : "L"}${point(i, v)}`).join(" ");
      const first = segment[0]!;
      const last = segment[segment.length - 1]!;
      const fill = area && segment.length > 1 ? `<path d="${d} L${point(last.i, 0)} L${point(first.i, 0)} Z" fill="url(#${prefix}-fill)"/>` : "";
      return `${fill}<path d="${d}" fill="none" stroke="url(#${prefix}-stroke)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
    })
    .join("");
  const dots =
    rows.length <= 24
      ? rows
          .map((row, i) => (row.value === null ? "" : `<circle cx="${point(i, row.value).split(",")[0]}" cy="${point(i, row.value).split(",")[1]}" r="4" fill="${theme.panel}" stroke="${SIGNAL_TO}" stroke-width="2"/>`))
          .join("")
      : "";
  const everyOther = Math.ceil(rows.length / 12);
  const labels = rows
    .map((row, i) => (i % everyOther === 0 ? `<text x="${point(i, 0).split(",")[0]}" y="${plotH + 20}" font-size="11" text-anchor="middle" fill="${theme.muted}">${esc(shortDate(row.label))}</text>` : ""))
    .join("");
  return { svg: `${grid}${paths}${dots}${labels}`, height: plotH + 34 };
}

function donut(ctx: Ctx): Plot {
  const { rows, measure, theme } = ctx;
  const total = rows.reduce((sum, r) => sum + (r.value ?? 0), 0);
  const cx = PAD + 130;
  const cy = 140;
  const outer = 112;
  const inner = 72;
  let angle = -Math.PI / 2;
  const arcs = rows
    .map((row, i) => {
      const value = row.value ?? 0;
      const sweep = total > 0 ? (value / total) * Math.PI * 2 : 0;
      const gap = rows.length > 1 ? 0.03 : 0;
      const a0 = angle + gap / 2;
      const a1 = angle + sweep - gap / 2;
      angle += sweep;
      if (sweep <= 0 || a1 <= a0) return "";
      const pt = (r: number, a: number) => `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
      const large = a1 - a0 > Math.PI ? 1 : 0;
      const color = GROUP_HEX[BRAND_GROUP_COLORS[i % BRAND_GROUP_COLORS.length]!] ?? SIGNAL_FROM;
      if (rows.length === 1 || sweep >= Math.PI * 2 - 0.001) {
        return `<circle cx="${cx}" cy="${cy}" r="${(outer + inner) / 2}" fill="none" stroke="${color}" stroke-width="${outer - inner}"/>`;
      }
      return `<path d="M${pt(outer, a0)} A${outer},${outer} 0 ${large} 1 ${pt(outer, a1)} L${pt(inner, a1)} A${inner},${inner} 0 ${large} 0 ${pt(inner, a0)} Z" fill="${color}"/>`;
    })
    .join("");
  const centre = `<text x="${cx}" y="${cy + 8}" font-size="30" font-weight="800" text-anchor="middle" fill="${theme.text}">${total.toLocaleString("en-US")}</text><text x="${cx}" y="${cy + 30}" font-size="10" font-weight="700" letter-spacing="1.5" text-anchor="middle" fill="${theme.muted}">TOTAL</text>`;
  const legend = rows
    .map((row, i) => {
      const y = 50 + i * 36;
      const color = GROUP_HEX[BRAND_GROUP_COLORS[i % BRAND_GROUP_COLORS.length]!] ?? SIGNAL_FROM;
      const pct = total > 0 && row.value !== null ? `${Math.round((row.value / total) * 100)}%` : "—";
      return `<circle cx="${PAD + 330}" cy="${y}" r="6" fill="${color}"/><text x="${PAD + 348}" y="${y + 5}" font-size="14" fill="${theme.text}">${esc(truncate(row.label, 30))}</text><text x="${PAD + 760}" y="${y + 5}" font-size="14" font-weight="700" text-anchor="end" fill="${theme.text}">${esc(fmt(row.value, measure))}</text><text x="${PAD + 840}" y="${y + 5}" font-size="12" text-anchor="end" fill="${theme.muted}">${pct}</text>`;
    })
    .join("");
  return { svg: `${arcs}${centre}${legend}`, height: Math.max(290, 50 + rows.length * 36 + 20) };
}

const TABLE_MAX_ROWS = 25;
function table(ctx: Ctx): Plot {
  const { rows, measure, dimension, theme } = ctx;
  const shown = rows.slice(0, TABLE_MAX_ROWS);
  const rowH = 30;
  const head = `<rect x="${PAD}" y="0" width="${INNER}" height="${rowH}" rx="8" fill="${theme.track}"/><text x="${PAD + 14}" y="19" font-size="11" font-weight="700" letter-spacing="1" fill="${theme.muted}">${esc(DIMENSION_LABELS[dimension].toUpperCase())}</text><text x="${PAD + INNER - 14}" y="19" font-size="11" font-weight="700" letter-spacing="1" text-anchor="end" fill="${theme.muted}">${esc(MEASURE_LABELS[measure].toUpperCase())}</text>`;
  const body = shown
    .map((row, i) => {
      const y = rowH + i * rowH;
      return `<line x1="${PAD}" y1="${y + rowH}" x2="${PAD + INNER}" y2="${y + rowH}" stroke="${theme.grid}"/><text x="${PAD + 14}" y="${y + 20}" font-size="13" fill="${theme.text}">${esc(truncate(isTimeDimension(dimension) ? shortDate(row.label) : row.label, 60))}</text><text x="${PAD + INNER - 14}" y="${y + 20}" font-size="13" font-weight="700" text-anchor="end" fill="${theme.text}">${esc(fmt(row.value, measure))}</text>`;
    })
    .join("");
  const more = rows.length > shown.length ? `<text x="${PAD + 14}" y="${rowH + shown.length * rowH + 22}" font-size="12" fill="${theme.muted}">+ ${rows.length - shown.length} more rows — the full table is in the CSV and Excel exports.</text>` : "";
  return { svg: `${head}${body}${more}`, height: rowH + shown.length * rowH + (more ? 34 : 8) };
}

function highlightsSvg(ctx: Ctx, y: number): string {
  const { rows, measure, dimension, theme } = ctx;
  const h = summarizeVisualRows(rows, { measure, dimension });
  const items: [string, string, string?][] = [];
  if (h.total !== null) items.push(["TOTAL", String(h.total)]);
  if (h.peak) items.push(["PEAK", fmt(h.peak.value, measure), isTimeDimension(dimension) ? shortDate(h.peak.label) : h.peak.label]);
  if (h.average !== null) items.push(["AVERAGE", fmt(h.average, measure), "per bucket"]);
  if (h.latest !== null) items.push(["LATEST", fmt(h.latest, measure)]);
  if (items.length === 0) return "";
  const colW = INNER / items.length;
  return items
    .map(([label, value, hint], i) => {
      const x = PAD + i * colW;
      return `<text x="${x}" y="${y}" font-size="11" font-weight="700" letter-spacing="1.2" fill="${theme.muted}">${label}</text><text x="${x}" y="${y + 30}" font-size="26" font-weight="800" fill="${theme.text}">${esc(value)}</text>${hint ? `<text x="${x}" y="${y + 48}" font-size="11" fill="${theme.muted}">${esc(truncate(hint, 24))}</text>` : ""}`;
    })
    .join("");
}

/**
 * A finished picture of a visual — the same chart, colours and numbers the dashboard shows, on a Mediaory
 * -branded card: standalone SVG that opens anywhere (browser, Figma, Keynote), prints sharp, and is what the
 * PNG, HTML and Excel exports are made from. Pure string output; no browser needed.
 */
export function renderVisualSvg(input: VisualExportInput, theme: VisualTheme = "dark"): string {
  const t = THEMES[theme];
  const prefix = "mv";
  const ctx: Ctx = { ...input, theme: t, prefix };
  const tooManySlices = input.chartType === "pie" && input.rows.length > VISUAL_PIE_MAX_SLICES;
  const type: VisualChartType = tooManySlices ? "table" : input.chartType;
  const time = isTimeDimension(input.dimension);

  let plot: Plot;
  if (input.rows.length === 0) {
    plot = { svg: `<text x="${PAD}" y="30" font-size="14" fill="${t.muted}">No data for this period.</text>`, height: 60 };
  } else if (type === "table") plot = table(ctx);
  else if (type === "pie") plot = donut(ctx);
  else if (type === "line") plot = lineOrArea(ctx, false);
  else if (type === "area") plot = lineOrArea(ctx, true);
  else plot = time ? verticalBars(ctx) : horizontalBars(ctx);

  const highlightY = 150;
  const hasHighlights = highlightsSvg(ctx, highlightY) !== "";
  const plotY = hasHighlights ? 236 : 160;
  const height = plotY + plot.height + 64;
  const subtitle = `${MEASURE_LABELS[input.measure]} by ${DIMENSION_LABELS[input.dimension].toLowerCase()} · last ${input.periodDays} days`;
  const note = tooManySlices ? `<text x="${PAD}" y="${plotY - 12}" font-size="11" fill="${t.muted}">A pie chart shows at most ${VISUAL_PIE_MAX_SLICES} slices; showing the table instead.</text>` : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}" role="img" aria-label="${esc(input.name)}: ${esc(subtitle)}" font-family="Inter, 'Segoe UI', 'DejaVu Sans', Arial, sans-serif">
  ${defs(prefix)}
  <rect width="${WIDTH}" height="${height}" rx="20" fill="${t.bg}"/>
  <rect x="1" y="1" width="${WIDTH - 2}" height="${height - 2}" rx="19" fill="${t.panel}" stroke="${t.border}"/>
  <rect x="1" y="1" width="${WIDTH - 2}" height="6" rx="3" fill="url(#${prefix}-brand)"/>
  <image href="${t.logo}" x="${PAD}" y="26" height="34" width="${Math.round(34 * (1872 / 529))}"/>
  <text x="${WIDTH - PAD}" y="48" font-size="11" font-weight="700" letter-spacing="2" text-anchor="end" fill="${t.muted}">VISUAL</text>
  <text x="${PAD}" y="102" font-size="24" font-weight="800" fill="${t.text}">${esc(truncate(input.name, 64))}</text>
  <text x="${PAD}" y="124" font-size="13" fill="${t.muted}">${esc(subtitle)}</text>
  ${highlightsSvg(ctx, highlightY)}
  ${note}
  <g transform="translate(0 ${plotY})">${plot.svg}</g>
  <text x="${PAD}" y="${height - 26}" font-size="11" fill="${t.muted}">Generated by Mediaory · ${BRAND.site} · ${new Date().toISOString().slice(0, 10)}</text>
</svg>`;
}

/** A self-contained page: the picture, its numbers as a table, and the logo — opens offline, prints, shares. */
export function renderVisualHtml(input: VisualExportInput, theme: VisualTheme = "dark"): string {
  const t = THEMES[theme];
  const subtitle = `${MEASURE_LABELS[input.measure]} by ${DIMENSION_LABELS[input.dimension].toLowerCase()} · last ${input.periodDays} days`;
  const rows = input.rows
    .map((row) => `<tr><th scope="row">${esc(isTimeDimension(input.dimension) ? shortDate(row.label) : row.label)}</th><td>${esc(fmt(row.value, input.measure))}</td></tr>`)
    .join("");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(input.name)} · Mediaory</title>
<style>
  *{box-sizing:border-box}body{margin:0;background:${t.bg};color:${t.text};font:15px/1.5 Inter,system-ui,"Segoe UI",sans-serif;padding:24px}
  main{max-width:1000px;margin:0 auto;display:flex;flex-direction:column;gap:20px}
  figure{margin:0}figure svg{width:100%;height:auto;display:block;border-radius:20px}
  table{width:100%;border-collapse:collapse;background:${t.panel};border:1px solid ${t.border};border-radius:12px;overflow:hidden}
  caption{text-align:left;padding:12px 16px;color:${t.muted};font-size:13px}
  th,td{padding:8px 16px;border-top:1px solid ${t.grid};text-align:left}td{text-align:right;font-variant-numeric:tabular-nums;font-weight:700}
  thead th{background:${t.track};color:${t.muted};font-size:11px;letter-spacing:.08em;text-transform:uppercase;border-top:0}
  thead th:last-child{text-align:right}
</style></head><body><main>
<figure>${renderVisualSvg(input, theme)}<figcaption class="sr-only" style="position:absolute;left:-9999px">${esc(input.name)} — ${esc(subtitle)}</figcaption></figure>
<table><caption>${esc(input.name)} — the same numbers as a table</caption>
<thead><tr><th scope="col">${esc(DIMENSION_LABELS[input.dimension])}</th><th scope="col">${esc(MEASURE_LABELS[input.measure])}</th></tr></thead>
<tbody>${rows}</tbody></table>
</main></body></html>`;
}
