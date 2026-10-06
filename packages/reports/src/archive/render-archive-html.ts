import { SOURCE_KINDS, countryName, sourceKindOfType, sourceTypeBadge } from "@cim/core";
import type { ArchiveMention } from "@cim/db";

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ESCAPES[c]!);
}

/** Only http(s) addresses become links; anything else (javascript:, data:, …) is shown as text. */
export function safeHref(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

const TZ = "Europe/Istanbul";
const dayTitle = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const timeOf = (date: Date) => date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: TZ });

export type ArchiveHtmlInput = {
  organizationName: string;
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  generatedAt: Date;
  truncated: boolean;
  mentions: ArchiveMention[];
};

const CSS = `
:root{--bg:#f6f7fb;--card:#fff;--ink:#14161f;--muted:#5d6475;--line:#e3e6ef;--accent:#6a3dff;--pos:#0b8a4a;--neg:#c42b3a;--neu:#5d6475}
@media (prefers-color-scheme:dark){:root{--bg:#0e1017;--card:#171a24;--ink:#eef0f6;--muted:#9aa2b6;--line:#272c3b;--accent:#9d86ff;--pos:#3ccf85;--neg:#ff6b78;--neu:#9aa2b6}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
main{max-width:980px;margin:0 auto;padding:24px 16px 64px}
h1{font-size:1.5rem;margin:.2rem 0}h2{font-size:1rem;margin:0}.muted{color:var(--muted)}
header.top{background:linear-gradient(135deg,#6a3dff,#ff3d9a);color:#fff;border-radius:18px;padding:22px 24px;margin-bottom:18px}
header.top .muted{color:rgba(255,255,255,.85)}
.stats{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}.stat{background:rgba(255,255,255,.18);border-radius:999px;padding:4px 12px;font-size:.85rem}
details.day{background:var(--card);border:1px solid var(--line);border-radius:16px;margin:12px 0}
details.day>summary{cursor:pointer;padding:14px 18px;font-weight:700;display:flex;justify-content:space-between;gap:12px}
details.day>summary .n{font-weight:500;color:var(--muted)}
.mon{border-top:1px solid var(--line);padding:10px 18px 14px}.mon h2{display:flex;justify-content:space-between;color:var(--accent)}
.kind{margin:10px 0 2px;font-size:.72rem;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
ul{list-style:none;margin:0;padding:0}li.m{padding:10px 0;border-top:1px dashed var(--line)}li.m:first-child{border-top:0}
a{color:var(--accent)}a.t{font-weight:600;text-decoration:none;color:var(--ink)}a.t:hover{text-decoration:underline}
.badge{display:inline-block;font-size:.7rem;font-weight:700;border-radius:6px;padding:1px 7px;background:var(--line);color:var(--ink);margin-right:6px}
.meta{font-size:.82rem;color:var(--muted)}.ex{font-size:.88rem;margin:.25rem 0 0}
.chips span{display:inline-block;font-size:.72rem;border:1px solid var(--line);border-radius:999px;padding:0 8px;margin:4px 4px 0 0;color:var(--muted)}
.pos{color:var(--pos)}.neg{color:var(--neg)}.neu{color:var(--neu)}
footer{margin-top:28px;font-size:.8rem;color:var(--muted)}
`;

function renderMention(m: ArchiveMention): string {
  const href = safeHref(m.url);
  const title = escapeHtml(m.title || "(untitled)");
  const titleHtml = href ? `<a class="t" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${title}</a>` : `<span class="t">${title}</span>`;
  const sentiment = m.sentiment ? `<span class="${m.sentiment === "positive" ? "pos" : m.sentiment === "negative" ? "neg" : "neu"}"> · ${escapeHtml(m.sentiment)}</span>` : "";
  const priority = m.priority !== "normal" ? ` · ${escapeHtml(m.priority)} priority` : "";
  const print = m.print
    ? `<div class="meta">Printed edition: ${escapeHtml(m.print.publication)}${m.print.editionDate ? ` · ${escapeHtml(m.print.editionDate)}` : ""}${m.print.section ? ` · ${escapeHtml(m.print.section)}` : ""}${m.print.page ? ` · page ${escapeHtml(String(m.print.page))}` : ""}${(() => {
        const page = m.print.pageUrl ? safeHref(m.print.pageUrl) : null;
        return page ? ` · <a href="${escapeHtml(page)}" target="_blank" rel="noopener noreferrer">view page</a>` : "";
      })()}</div>`
    : "";
  const chips = [...m.matchedTerms.map((t) => escapeHtml(t)), ...m.tags.map((t) => `#${escapeHtml(t)}`)];
  return `<li class="m"><span class="badge">${escapeHtml(sourceTypeBadge(m.sourceType))}</span>${titleHtml}
<div class="meta">${escapeHtml(m.sourceName)}${m.sourceCountry ? ` · ${escapeHtml(countryName(m.sourceCountry))}` : ""} · ${escapeHtml(timeOf(m.occurredAt))}${sentiment}${priority}</div>
${m.excerpt ? `<p class="ex">${escapeHtml(m.excerpt)}</p>` : ""}${print}${chips.length ? `<div class="chips">${chips.map((c) => `<span>${c}</span>`).join("")}</div>` : ""}</li>`;
}

/**
 * The week's mentions as ONE self-contained page — no scripts, no external files — so it opens
 * anywhere, offline, from an email or a link. It carries what the app stores and shows
 * (title, source, short excerpt, matched words, sentiment, tags) and a link to each original;
 * it never copies publishers' pages.
 */
export function renderArchiveHtml(input: ArchiveHtmlInput): string {
  const { mentions } = input;
  const byDay = new Map<string, ArchiveMention[]>();
  for (const m of mentions) byDay.set(m.day, [...(byDay.get(m.day) ?? []), m]);

  const sentimentCount = (s: string) => mentions.filter((m) => m.sentiment === s).length;
  const sources = new Set(mentions.map((m) => m.sourceName)).size;
  const perQuery = new Map<string, { name: string; n: number }>();
  for (const m of mentions) perQuery.set(m.queryId, { name: m.queryName, n: (perQuery.get(m.queryId)?.n ?? 0) + 1 });

  const days = [...byDay.entries()]
    .map(([day, items]) => {
      const queries = new Map<string, { name: string; items: ArchiveMention[] }>();
      for (const m of items) {
        const entry = queries.get(m.queryId) ?? { name: m.queryName, items: [] };
        entry.items.push(m);
        queries.set(m.queryId, entry);
      }
      const monitoringHtml = [...queries.values()]
        .map((q) => {
          const kinds = SOURCE_KINDS.map((kind) => ({ kind, list: q.items.filter((m) => sourceKindOfType(m.sourceType) === kind.key) })).filter((k) => k.list.length > 0);
          return `<section class="mon"><h2><span>${escapeHtml(q.name)}</span><span class="muted">${q.items.length}</span></h2>${kinds
            .map((k) => `<div class="kind">${escapeHtml(k.kind.label)} · ${k.list.length}</div><ul>${k.list.map(renderMention).join("")}</ul>`)
            .join("")}</section>`;
        })
        .join("");
      return `<details class="day" open><summary><span>${escapeHtml(dayTitle(day))}</span><span class="n">${items.length} ${items.length === 1 ? "story" : "stories"}</span></summary>${monitoringHtml}</details>`;
    })
    .join("\n");

  const title = `${input.organizationName} — weekly archive ${input.periodLabel}`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${escapeHtml(title)}</title><style>${CSS}</style></head>
<body><main>
<header class="top"><div class="muted">Mediaory · weekly archive</div><h1>${escapeHtml(input.organizationName)}</h1>
<div class="muted">${escapeHtml(input.periodLabel)} · ${escapeHtml(input.periodStart)} to ${escapeHtml(input.periodEnd)}</div>
<div class="stats"><span class="stat">${mentions.length.toLocaleString("en-GB")} mentions</span><span class="stat">${sources.toLocaleString("en-GB")} sources</span>
<span class="stat">${sentimentCount("positive")} positive</span><span class="stat">${sentimentCount("neutral")} neutral</span><span class="stat">${sentimentCount("negative")} negative</span>
${[...perQuery.values()].map((q) => `<span class="stat">${escapeHtml(q.name)} · ${q.n}</span>`).join("")}</div></header>
${input.truncated ? `<p class="muted">This week had more mentions than one archive holds; the newest ${mentions.length.toLocaleString("en-GB")} are included.</p>` : ""}
${days || `<p class="muted">No mentions this week.</p>`}
<footer>Generated ${escapeHtml(input.generatedAt.toISOString().slice(0, 16).replace("T", " "))} UTC. Titles, short excerpts and links only — open a link to read the original at its publisher. Times are Türkiye time.</footer>
</main></body></html>
`;
}
