import { BRAND_COLORS, BRAND_LOGO_DATA_URI, BRAND_LOGO_LIGHT_DATA_URI, BRAND_MARK_DATA_URI } from "./brand.generated";

export { BRAND_COLORS, BRAND_LOGO_DATA_URI, BRAND_LOGO_LIGHT_DATA_URI, BRAND_MARK_DATA_URI };

/** The one template every Mediaory document (report, archive, export) is built on: logo, colours, type. */
export const BRAND = {
  ink: BRAND_COLORS.ink,
  blue: BRAND_COLORS.blue,
  violet: BRAND_COLORS.violet,
  cyan: BRAND_COLORS.cyan,
  /** violet → blue → cyan, left to right */
  gradient: `linear-gradient(90deg, ${BRAND_COLORS.violet}, ${BRAND_COLORS.blue} 55%, ${BRAND_COLORS.cyan})`,
  site: "mediaory.io",
} as const;

/** Page furniture shared by all branded HTML documents. */
export const BRAND_CSS = `
  :root { --ink: ${BRAND.ink}; --blue: ${BRAND.blue}; --violet: ${BRAND.violet}; --cyan: ${BRAND.cyan}; --muted: #5b6275; --line: #e3e6f0; --soft: #f5f7fc; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: "Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; color: var(--ink); background: #fff; margin: 0; padding: 0 32px 24px; font-size: 12px; line-height: 1.45; }
  .brand-bar { height: 6px; background: ${BRAND.gradient}; margin: 0 -32px 22px; }
  .brand-head { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 22px; }
  .brand-head img { height: 34px; width: auto; display: block; }
  .brand-head .doc-kind { font-size: 10px; letter-spacing: .14em; text-transform: uppercase; color: var(--muted); font-weight: 600; }
  h1 { font-size: 24px; line-height: 1.2; margin: 0 0 6px; letter-spacing: -.01em; }
  .meta { color: var(--muted); font-size: 11px; margin: 0 0 24px; }
  h2 { font-size: 13px; font-weight: 700; margin: 0 0 10px; display: flex; align-items: center; gap: 8px; }
  h2::before { content: ""; width: 4px; height: 14px; border-radius: 2px; background: linear-gradient(180deg, var(--violet), var(--cyan)); }
  section { margin-bottom: 26px; break-inside: avoid-page; }
  .kpi-row { display: flex; gap: 12px; margin-bottom: 28px; }
  .kpi { flex: 1; background: var(--soft); border: 1px solid var(--line); border-radius: 10px; padding: 12px 14px; position: relative; overflow: hidden; }
  .kpi::before { content: ""; position: absolute; inset: 0 auto 0 0; width: 4px; background: linear-gradient(180deg, var(--violet), var(--cyan)); }
  .kpi .label { color: var(--muted); font-size: 10px; text-transform: uppercase; letter-spacing: .05em; }
  .kpi .value { font-size: 22px; font-weight: 700; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th, td { text-align: left; padding: 7px 8px; border-bottom: 1px solid var(--line); vertical-align: top; }
  th { color: var(--muted); font-weight: 600; text-transform: uppercase; font-size: 9px; letter-spacing: .05em; background: var(--soft); }
  .badge { display: inline-block; padding: 1px 8px; border-radius: 999px; font-size: 10px; font-weight: 600; }
  .empty { color: var(--muted); font-style: italic; }
  .chart-axis { display: flex; justify-content: space-between; font-size: 10px; color: var(--muted); margin-top: 4px; }
  a { color: var(--blue); }
  .brand-foot { margin-top: 30px; padding-top: 12px; border-top: 1px solid var(--line); color: var(--muted); font-size: 10px; display: flex; align-items: center; gap: 10px; }
  .brand-foot img { height: 16px; width: 16px; }
`;

const escapeHtml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Gradient bar + logo + what kind of document this is. */
export function brandHeaderHtml(docKind: string): string {
  return `<div class="brand-bar"></div><div class="brand-head"><img src="${BRAND_LOGO_DATA_URI}" alt="Mediaory" /><span class="doc-kind">${escapeHtml(docKind)}</span></div>`;
}

export function brandFooterHtml(note: string): string {
  return `<div class="brand-foot"><img src="${BRAND_MARK_DATA_URI}" alt="" /><span>${escapeHtml(note)} · Mediaory · ${BRAND.site}</span></div>`;
}
