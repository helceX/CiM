#!/usr/bin/env node
/**
 * Regenerates packages/core/src/world-catalog.generated.ts from the operator's
 * world RSS pack (scripts/data/DÜNYA RSS PAKETİ/Kategorili_RSS_Katalogu.json).
 *
 * Only facts from the pack are copied (name, feed address, country, language,
 * the pack's own type and topic labels, whether the pack's XML check passed).
 * Nothing here decides whether a feed may be used: licence-required agencies and
 * Reddit (its RSS ends 13 Nov 2026) are dropped, plain-http feeds are left out
 * (the catalog is https-only), a feed already in the Turkey catalog counts once,
 * and /admin/sources fetch-tests every feed before storing it.
 *
 * Usage: pnpm exec tsx scripts/import-world-pack.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { feedIdentity, TURKEY_SOURCE_CATALOG } from "../packages/core/src/source-catalog";
import { hostOfUrl, isLicenseRequiredHost } from "../packages/core/src/restricted-publishers";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const pack = path.join(root, "scripts/data/DÜNYA RSS PAKETİ/Kategorili_RSS_Katalogu.json");
const countryNames: Record<string, string | null> = JSON.parse(
  readFileSync(path.join(root, "scripts/data/world-country-names-tr.json"), "utf8"),
);

type PackRecord = {
  id: string;
  name: string;
  type: string;
  topic: string;
  country: string;
  language: string;
  rss: string;
  verified: boolean;
};
const records = (JSON.parse(readFileSync(pack, "utf8")) as { kayitlar: PackRecord[] }).kayitlar;

/** pack type → Source.type */
function sourceType(type: string): string {
  if (type === "Podcast") return "podcast";
  if (type === "Video platformu") return "youtube";
  if (type === "Forum" || type === "Soru-cevap" || type === "Sosyal haber / topluluk") return "forum";
  if (type === "Blog" || type === "Blog platformu / topluluk") return "blog";
  if (type.startsWith("Sosyal ağ")) return "social";
  if (type === "Haber / medya" || type === "Dergi / kültür") return "news";
  return "website"; // dictionaries, wikis, encyclopedias, archives, research, education, fact-checks
}

/** Group = what a person browsing would call it. Non-news kinds get their own group; news is split by topic. */
function groupOf(rec: PackRecord, url: URL): string {
  const type = sourceType(rec.type);
  if (type === "podcast") return "podcasts";
  if (type === "youtube") return "video";
  if (type === "forum") return "forums";
  if (type === "blog") return "blogs";
  if (type === "social") return "social";
  if (type === "website") return "reference";
  const text = `${rec.topic} ${url.hostname}${url.pathname}`.toLowerCase();
  const has = (...words: string[]) => words.some((w) => text.includes(w));
  if (has("savunma", "defence", "defense", "military")) return "defense";
  if (has("spor", "sport", "futbol", "football", "soccer", "deporte", "basket")) return "sports";
  if (has("ekonomi", "finans", "business", "economy", "economia", "finance", "markets", "money", "iş dünyası", "girişim")) return "economy";
  if (has("teknoloji", "yazılım", "tech", "software", "engineering", "startup", "machine learning", "tecnolog")) return "technology";
  if (has("bilim", "science", "ciencia")) return "science";
  if (has("kültür", "sanat", "sinema", "müzik", "kitap", "culture", "cultura", "arts", "music", "film")) return "culture";
  if (has("eğlence", "oyun", "entertainment", "gaming", "games")) return "entertainment";
  if (has("yaşam", "seyahat", "otomotiv", "lifestyle", "travel", "health", "salud")) return "lifestyle";
  if (has("yerel", "local")) return "local";
  return "general";
}

function languageOf(raw: string): string {
  const m = /^[a-z]{2,3}/i.exec(raw.trim());
  return m ? m[0].toLowerCase() : "";
}

const known = new Set(TURKEY_SOURCE_CATALOG.map((e) => feedIdentity(e.url)));
const skipped = { noFeed: 0, http: 0, licensed: 0, reddit: 0, duplicate: 0, invalid: 0 };
type Row = [id: string, name: string, url: string, country: string, language: string, type: string, group: string, verified: 0 | 1];
const rows: Row[] = [];

for (const rec of records) {
  if (!rec.rss) { skipped.noFeed++; continue; }
  let url: URL;
  try { url = new URL(rec.rss); } catch { skipped.invalid++; continue; }
  if (url.protocol !== "https:") { skipped.http++; continue; }
  const host = hostOfUrl(url.toString())!;
  if (isLicenseRequiredHost(host)) { skipped.licensed++; continue; }
  if (/(^|\.)reddit\.com$/.test(host)) { skipped.reddit++; continue; }
  const identity = feedIdentity(url.toString());
  if (known.has(identity)) { skipped.duplicate++; continue; }
  known.add(identity);
  const name = rec.name.replace(/\s+/g, " ").trim();
  if (!name) { skipped.invalid++; continue; }
  rows.push([
    rec.id,
    name,
    url.toString(),
    countryNames[rec.country] ?? "",
    languageOf(rec.language),
    sourceType(rec.type),
    groupOf(rec, url),
    rec.verified ? 1 : 0,
  ]);
}

const header = `// GENERATED by scripts/import-world-pack.ts from the operator's world RSS pack (checked 2026-10-05).
// Do not edit by hand — re-run the script. Candidates, not guarantees: every feed is fetch-tested at /admin/sources before it is stored.
// Row: [pack id, name, feed url, ISO country ("" = global / not confirmed), language, Source.type, group, XML-checked by the pack (1/0)]
`;
writeFileSync(
  path.join(root, "packages/core/src/world-catalog.generated.ts"),
  `${header}export const WORLD_CATALOG_ROWS: ReadonlyArray<readonly [string, string, string, string, string, string, string, 0 | 1]> = ${JSON.stringify(rows)};\n`,
);
console.log(`Wrote ${rows.length} feeds`, skipped);
