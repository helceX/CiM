#!/usr/bin/env node
/**
 * Regenerates packages/core/src/source-catalog.list.generated.ts from a plain
 * list of RSS/Atom feed addresses (one per line), such as the verified list of
 * Turkish news, blog, forum and trade feeds in scripts/data/.
 *
 * Only facts are copied — the feed address — and a name, a group and a type are
 * DERIVED from the address. Nothing here decides whether a feed may be used:
 * the catalog drops licence-required agencies at runtime, skips any feed that is
 * already in the earlier catalogs (same feed written another way counts as the
 * same), and /admin/sources fetch-tests every feed before it is stored.
 *
 * Usage: pnpm exec tsx scripts/import-rss-list.ts scripts/data/tr-rss-list-2026-10-02.txt
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { feedIdentity } from "../packages/core/src/source-catalog";
import { hostOfUrl, isLicenseRequiredHost } from "../packages/core/src/restricted-publishers";
import { GENERATED_CATALOG } from "../packages/core/src/source-catalog.generated";

const source = process.argv[2];
if (!source) {
  console.error("Usage: pnpm exec tsx scripts/import-rss-list.ts <list.txt>");
  process.exit(1);
}

const BRANDS: Record<string, string> = {
  "ahaber.com.tr": "A Haber", "aksam.com.tr": "Akşam", "ntv.com.tr": "NTV", "ntvspor.net": "NTV Spor",
  "cnnturk.com": "CNN Türk", "trthaber.com": "TRT Haber", "hurriyet.com.tr": "Hürriyet", "sabah.com.tr": "Sabah",
  "sozcu.com.tr": "Sözcü", "milliyet.com.tr": "Milliyet", "haberturk.com": "Habertürk", "cumhuriyet.com.tr": "Cumhuriyet",
  "yenisafak.com": "Yeni Şafak", "yeniakit.com.tr": "Yeni Akit", "star.com.tr": "Star", "takvim.com.tr": "Takvim",
  "fotomac.com.tr": "Fotomaç", "aspor.com.tr": "A Spor", "birgun.net": "BirGün", "halktv.com.tr": "Halk TV",
  "bloomberght.com": "Bloomberg HT", "dunya.com": "Dünya", "ekonomim.com": "Ekonomim", "ekonomist.com.tr": "Ekonomist",
  "forbes.com.tr": "Forbes Türkiye", "capital.com.tr": "Capital", "webrazzi.com": "Webrazzi", "webtekno.com": "Webtekno",
  "shiftdelete.net": "ShiftDelete.Net", "donanimhaber.com": "DonanımHaber", "mynet.com": "Mynet", "onedio.com": "Onedio",
  "diken.com.tr": "Diken", "medyascope.tv": "Medyascope", "indyturk.com": "Independent Türkçe", "odatv.com": "Oda TV",
  "yenicaggazetesi.com": "Yeniçağ", "aydinlik.com.tr": "Aydınlık", "karar.com": "Karar", "tele1.com.tr": "Tele1",
  "artigercek.com": "Artı Gerçek", "haber.sol.org.tr": "sol.org.tr", "gzt.com": "GZT", "cnbce.com": "CNBC-e",
  "feeds.bbci.co.uk": "BBC Türkçe", "rss.dw.com": "DW Türkçe", "tr.euronews.com": "Euronews", "tr.investing.com": "Investing.com Türkiye",
  "voaturkce.com": "VOA Türkçe", "tr.irna.ir": "IRNA Türkçe", "acikgazete.com": "Açık Gazete", "evrimagaci.org": "Evrim Ağacı",
  "kibrisgazetesi.com.tr": "Kıbrıs Gazetesi", "gundemkibris.com": "Gündem Kıbrıs", "nehaberkibris.com": "Ne Haber Kıbrıs",
  "kayiprihtim.com": "Kayıp Rıhtım", "forum.kayiprihtim.com": "Kayıp Rıhtım Forum", "forum.linux.net.tr": "Linux.net.tr Forum",
  "forum.pardus.org.tr": "Pardus Forum", "forum.ubuntu-tr.net": "Ubuntu-tr Forum", "forumsaati.net": "Forum Saati",
  "rss.haberler.com": "Haberler.com", "rss.sondakika.com": "Sondakika.com", "i12.haber7.net": "Haber7",
  "e-inegol.com": "e-İnegöl", "gdhdijital.com": "GDH Dijital", "isindetayi.com": "İşin Detayı", "5ocakgazetesi.com": "5 Ocak Gazetesi",
  "61saat.com": "61 Saat", "bursadabugun.com": "Bursa'da Bugün", "egepusulahaber.com": "Ege Pusula", "egedesonsoz.com": "Egede Son Söz",
  "guneydoguekspres.com": "Güneydoğu Ekspres", "konyayenigun.com": "Konya Yeni Gün", "habergazetesi.com.tr": "Haber Gazetesi",
  "malatyahaber.com": "Malatya Haber", "manisahaberleri.com": "Manisa Haberleri", "mersinobjektif.com.tr": "Mersin Objektif",
  "eskisehir.net": "Eskişehir.net", "esgazete.com": "ES Gazete", "elazigsonhaber.com": "Elazığ Son Haber", "yaylahaber.com.tr": "Yayla Haber",
};
const TLDS = new Set(["com", "net", "org", "tr", "gen", "info", "biz", "tv", "co", "io", "press", "news", "me", "ir", "xyz"]);

const trTitle = (s: string) => s.replace(/(^|\s)(\p{L})/gu, (_, a, b) => a + b.toUpperCase());

function brandOf(host: string): string {
  if (BRANDS[host]) return BRANDS[host];
  const parts = host.split(".").filter((p) => !TLDS.has(p));
  const label = (parts.join(" ") || host).replace(/-/g, " ");
  return trTitle(label);
}

const GENERIC_LAST = new Set(["news", "gallery", "galleries", "video", "videos", "articles", "biographies", "all"]);
const NO_DESCRIPTOR = new Set(["index", "latest", "syndication", "rss", "feed", "latest posts", "latest-posts"]);

function descriptorOf(u: URL): string {
  const q = u.searchParams;
  const named = q.get("category") ?? q.get("name") ?? q.get("cid") ?? q.get("feed");
  const segments = u.pathname
    .split("/")
    .filter(Boolean)
    .filter((s) => !/^(rss|feed|feeds|xml|export|service|rss\.xml|rss\.php|feed\.xml|rss-feeds|categorynews|category|type|kategori|lokasyon|article|-)$/i.test(s))
    .map((s) => s.replace(/\.(xml|rss|php|html?)$/i, ""));
  let last = named ?? segments[segments.length - 1] ?? "";
  // "/turkiye/news" and "/dunya/news" are told apart by the segment before the generic one.
  if (!named && GENERIC_LAST.has(last.toLowerCase()) && segments.length > 1) last = `${segments[segments.length - 2]} ${last}`;
  const text = trTitle(decodeURIComponent(last).replace(/[-_]+/g, " ").trim());
  return NO_DESCRIPTOR.has(text.toLowerCase()) ? "" : text;
}

const slug = (value: string) =>
  value
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i").replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s").replace(/ö/g, "o").replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const has = (text: string, words: string[]) => words.some((w) => text.includes(w));

function groupOf(host: string, p: string): { group: string; type: string } {
  const text = `${host}${p}`.toLowerCase();
  if (/\/(yazar|yazarlar|author|authors)(\/|$)/.test(p) || p.includes("koese-yazilari") || p.includes("kose-yazilari") || p.endsWith("/rssmakale")) return { group: "columns", type: "news" };
  if (host.startsWith("forum.") || has(text, ["/forum", "forumsaati", "forum/-/index.rss", "xenforo", "/sosyal/bolum", "index.php?action=.xml", "/forumlar/"]) || /(^|\.)iyinet\.com$/.test(host)) return { group: "forums", type: "forum" };
  if (has(host, ["savunma", "defence", "c4defence", "defenceturk", "mavisavunma", "sahagundemi"]) || has(p, ["savunma"])) return { group: "defense", type: "news" };
  if (has(host, ["ntvspor", "fotomac", "aspor", "futboo", "galatasaray.org", "basketdergisi", "ajansspor", "kontraspor", "taraftarhaber", "spor.mynet"]) || has(p, ["spor", "futbol", "basketbol", "voleybol", "superlig", "fenerbahce", "galatasaray", "besiktas", "trabzonspor", "bursaspor", "olimpiyat", "tenis", "samsunspor", "konyaspor", "orduspor", "denizlispor", "vanspor", "eskisehirspor", "at-yarisi"])) return { group: "sports", type: "news" };
  if (has(host, ["bloomberght", "dunya.com", "ekonomim", "ekonomist", "ekonomigazetesi", "capital.com", "foreks", "investing.com", "doviz.com", "coinkolik", "uzmancoin", "getmidas", "halkarz", "finansingundemi", "borsaningundemi", "paradergi", "paraninyonu", "cnbce", "fortuneturkey", "forbes.com.tr", "finansgundem"]) || has(p, ["ekonomi", "borsa", "finans", "emtia", "kripto", "forex", "bonds", "stock", "markets", "halka-arz", "ntvpara", "/economy", "market_overview"])) return { group: "economy", type: "news" };
  if (has(host, ["isindetayi", "patronlardunyasi", "marketingturkiye", "campaigntr", "egirisim", "foundern", "startupteknoloji", "mediacat", "cozumpark", "turizmguncel", "turizmajansi", "turizmgunlugu", "lojiport", "tobb.org"]) || has(p, ["is-dunyasi", "girisim", "sirket-haberleri", "lojistik", "patronlar"])) return { group: "business", type: "news" };
  if (has(host, ["shiftdelete", "webtekno", "donanim", "technopat", "chip.com", "megabayt", "tamindir", "teknoblog", "teknodiot", "techturco", "techdergi", "voicetekno", "mobidictum", "geekyapar", "turk-internet", "webrazzi", "log.com", "frpnet", "trendus", "beetekno", "teknolojioku", "techolay", "teknoburada", "dijitaliyidir", "uplifers", "news.samsung", "swipeline", "webmasto", "playtusu", "misternoob", "oyungezer", "bigumigu", "indir.com", "hwp.com", "sosyalmedya", "dijitalgaste", "ign.com"]) || has(p, ["teknoloji", "bilim-teknoloji", "yapay-zeka", "bilim-ve-teknoloji", "dijital"])) return { group: "technology", type: "news" };
  if (has(host, ["bilim", "arkeofili", "evrimagaci", "kozmikanafor", "matematiksel", "moletik", "sarkac", "gercekbilim", "gelecekbilimde", "bilimup", "bilimoloji", "tarihlibilim", "tarihtenyazilar", "tarihistan", "mitoloji", "iklimhaber", "ekoyapi", "fantastikcanavarlar", "onculanalitikfelsefe", "cekiclefelsefe", "argonotlar", "merlininkazani", "kesifasya", "terrabayt"]) || has(p, ["/bilim", "bilim-", "/nasil", "/neden", "nature", "earth-news", "water"])) return { group: "science", type: "news" };
  if (has(host, ["sinema", "altyazi", "beyazperde", "bagimsizsinema", "marjinalsinema", "sinetopya", "otekisinema", "kitap", "binbirkitap", "edebi", "artkolik", "artdogistanbul", "nouvart", "cazkolik", "mixmag", "upcorn", "birbabaindie", "dergipark", "arkitera", "mimarizm", "gazetesanat", "sihirlielma", "daktilo", "10layn", "delikasap", "yedikita", "serbestiyet", "kayiprihtim", "5harfliler", "plumemag", "tarih"]) || has(p, ["kultur", "sanat", "sinema", "edebiyat", "culture", "/art", "design", "muzik"])) return { group: "culture", type: "news" };
  if (has(host, ["onedio", "listelist", "thegeyik", "dmax"]) || has(p, ["magazin", "dizi", "eglence", "fragman", "komedi", "tv-rehberi", "televizyon", "saklambac", "itiraflar", "vizyondakiler"])) return { group: "entertainment", type: "news" };
  if (has(host, ["elle.com", "harpersbazaar", "marieclaire", "gardiropmagazin", "guzellikyayinda", "livetobloom", "yasadikca", "medikalakademi", "saglikaktuel", "turunculevye", "hangisialinmali", "annekaz", "otopark", "autoajans", "outdoorturkiye", "bisikletforum", "motosiklet", "istanbullife", "turkiyedevedunyadagolf", "yeminlitercume"]) || has(p, ["saglik", "yasam", "kadin", "yemek", "tarifler", "moda", "seyahat", "otomobil", "otomotiv", "astroloji", "burc", "gezi", "turizm", "food", "nutrition", "wellbeing", "health", "travel", "lux", "mutfak", "gastronomi"])) return { group: "lifestyle", type: "news" };
  return { group: "general", type: has(host, ["medium.com", "mediumturkiye", "blog."]) ? "blog" : "news" };
}

const COUNTRY: Record<string, string> = {
  "gundemkibris.com": "CY", "kibrisgazetesi.com.tr": "CY", "nehaberkibris.com": "CY", "rss.dw.com": "DE", "feeds.bbci.co.uk": "GB",
  "tr.euronews.com": "FR", "voaturkce.com": "US", "tr.irna.ir": "IR", "medium.com": "US", "news.samsung.com": "KR",
};

const known = new Set(GENERATED_CATALOG.map((e) => feedIdentity(e.url)));
// The hand-curated list lives in source-catalog.ts; re-read its URLs without importing a cycle.
const curated = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "../packages/core/src/source-catalog.ts"), "utf8");
for (const match of curated.matchAll(/url:\s*"(https:[^"]+)"/g)) known.add(feedIdentity(match[1]!));

const lines = readFileSync(source, "utf8").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
const seenKeys = new Set<string>();
const entries: { key: string; name: string; url: string; type: string; language: string; country: string; group: string }[] = [];
const skipped = { duplicate: 0, licensed: 0, invalid: 0 };
for (const raw of lines) {
  let url: string;
  try {
    const u = new URL(raw.replace(/^http:\/\//i, "https://"));
    if (u.protocol !== "https:") throw new Error("not https");
    url = u.toString();
  } catch {
    skipped.invalid++;
    continue;
  }
  const host = hostOfUrl(url)!;
  if (isLicenseRequiredHost(host)) { skipped.licensed++; continue; }
  const identity = feedIdentity(url);
  if (known.has(identity)) { skipped.duplicate++; continue; }
  known.add(identity);

  const u = new URL(url);
  const { group, type } = groupOf(host, `${u.pathname}${u.search}`);
  const brand = brandOf(host);
  const descriptor = descriptorOf(u);
  const isColumn = group === "columns";
  const name = descriptor ? `${brand} · ${isColumn ? `Yazar: ${descriptor}` : descriptor}` : brand;
  let key = `rss2-${slug(name)}`;
  for (let i = 2; seenKeys.has(key); i++) key = `rss2-${slug(name)}-${i}`;
  seenKeys.add(key);
  entries.push({
    key, name, url, type, group,
    language: /\/rss\/en$/.test(u.pathname) ? "en" : "tr",
    country: COUNTRY[host] ?? "TR",
  });
}

const q = (s: string) => JSON.stringify(s);
const body = entries
  .map((e) => `  { key: ${q(e.key)}, name: ${q(e.name)}, url: ${q(e.url)}, type: ${q(e.type)}, language: ${q(e.language)}, country: ${q(e.country)}, group: ${q(e.group)} },`)
  .join("\n");
const out = `// GENERATED by scripts/import-rss-list.ts — do not edit by hand.
// Feed addresses only (names, groups and types are derived from them), from the
// verified list of Turkish news, blog, forum and trade feeds in scripts/data/.
// Candidates, not permissions: see source-catalog.ts.
import type { CatalogSource } from "./source-catalog";

export const LIST_CATALOG: readonly CatalogSource[] = [
${body}
];
`;
writeFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "../packages/core/src/source-catalog.list.generated.ts"), out);
const byGroup = new Map<string, number>();
for (const e of entries) byGroup.set(e.group, (byGroup.get(e.group) ?? 0) + 1);
console.log(`Wrote ${entries.length} feeds (skipped: ${JSON.stringify(skipped)}). By group:`, Object.fromEntries(byGroup));
