import { hostOfUrl, isLicenseRequiredHost } from "./restricted-publishers";
import { GENERATED_CATALOG } from "./source-catalog.generated";

/**
 * Candidate public RSS feeds of Turkish (and a few English-language Turkey)
 * outlets an operator can add as crawl sources from /admin.
 *
 * These are CANDIDATES, not guarantees: publishers move and retire feed URLs,
 * and nothing here was fetched when it was written. The admin screen therefore
 * fetches the feed and counts its items before it saves anything, and a feed
 * that does not parse is never stored. Only titles/excerpts are used — the
 * source policy for catalog sources is "no full-text storage".
 *
 * News agencies sold by subscription (AA, DHA, İHA, Reuters, AP, AFP) are
 * deliberately NOT listed: see restricted-publishers.ts.
 */
export type CatalogSource = {
  /** Stable key, used by the admin UI to pick an entry. */
  key: string;
  name: string;
  /** Feed URL (always https). */
  url: string;
  /** `Source.type` — see source-categories.ts. */
  type: "news" | "press" | "blog" | "website";
  language: "tr" | "en";
  country: "TR";
  group: CatalogGroup;
};

export const CATALOG_GROUPS = [
  "general",
  "economy",
  "business",
  "technology",
  "science",
  "sports",
  "culture",
  "entertainment",
  "lifestyle",
  "defense",
  "english",
] as const;
export type CatalogGroup = (typeof CATALOG_GROUPS)[number];

const CURATED_CATALOG: readonly CatalogSource[] = [
  { key: "hurriyet", name: "Hürriyet", url: "https://www.hurriyet.com.tr/rss/anasayfa", type: "news", language: "tr", country: "TR", group: "general" },
  { key: "sabah", name: "Sabah", url: "https://www.sabah.com.tr/rss/anasayfa.xml", type: "news", language: "tr", country: "TR", group: "general" },
  { key: "cumhuriyet", name: "Cumhuriyet", url: "https://www.cumhuriyet.com.tr/rss/son_dakika.xml", type: "news", language: "tr", country: "TR", group: "general" },
  { key: "milliyet", name: "Milliyet", url: "https://www.milliyet.com.tr/rss/rssnew/gundemrss.xml", type: "news", language: "tr", country: "TR", group: "general" },
  { key: "haberturk", name: "Habertürk", url: "https://www.haberturk.com/rss", type: "news", language: "tr", country: "TR", group: "general" },
  { key: "ntv", name: "NTV", url: "https://www.ntv.com.tr/son-dakika.rss", type: "news", language: "tr", country: "TR", group: "general" },
  { key: "trthaber", name: "TRT Haber", url: "https://www.trthaber.com/sondakika.rss", type: "news", language: "tr", country: "TR", group: "general" },
  { key: "t24", name: "T24", url: "https://t24.com.tr/rss", type: "news", language: "tr", country: "TR", group: "general" },
  { key: "bianet", name: "bianet", url: "https://bianet.org/rss/bianet", type: "news", language: "tr", country: "TR", group: "general" },
  { key: "medyascope", name: "Medyascope", url: "https://medyascope.tv/feed/", type: "news", language: "tr", country: "TR", group: "general" },
  { key: "bbc-turkce", name: "BBC Türkçe", url: "https://feeds.bbci.co.uk/turkce/rss.xml", type: "news", language: "tr", country: "TR", group: "general" },
  { key: "dunya", name: "Dünya", url: "https://www.dunya.com/rss", type: "news", language: "tr", country: "TR", group: "economy" },
  { key: "ekonomim", name: "Ekonomim", url: "https://www.ekonomim.com/rss", type: "news", language: "tr", country: "TR", group: "economy" },
  { key: "webrazzi", name: "Webrazzi", url: "https://webrazzi.com/feed/", type: "blog", language: "tr", country: "TR", group: "technology" },
  { key: "shiftdelete", name: "ShiftDelete.Net", url: "https://shiftdelete.net/feed", type: "news", language: "tr", country: "TR", group: "technology" },
  { key: "donanimhaber", name: "DonanımHaber", url: "https://www.donanimhaber.com/rss/tum/", type: "news", language: "tr", country: "TR", group: "technology" },
  { key: "daily-sabah", name: "Daily Sabah", url: "https://www.dailysabah.com/rssFeed/turkey", type: "news", language: "en", country: "TR", group: "english" },
  { key: "hurriyet-daily-news", name: "Hürriyet Daily News", url: "https://www.hurriyetdailynews.com/rss", type: "news", language: "en", country: "TR", group: "english" },
];

/** Same feed written two ways ("…/feed" vs "…/feed/", with or without "www.") counts once. */
export function feedIdentity(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/+$/, "") || "/";
    return `${hostOfUrl(url)}${path}${u.search}`.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

/**
 * The hand-checked list first (it wins on a duplicate), then the community list
 * in source-catalog.generated.ts. Anything on a licence-required agency's domain
 * is dropped here, so no catalog entry can ever point at one.
 */
export const TURKEY_SOURCE_CATALOG: readonly CatalogSource[] = (() => {
  const seenFeeds = new Set<string>();
  const seenKeys = new Set<string>();
  const merged: CatalogSource[] = [];
  for (const entry of [...CURATED_CATALOG, ...GENERATED_CATALOG]) {
    const host = hostOfUrl(entry.url);
    if (!host || isLicenseRequiredHost(host)) continue;
    const identity = feedIdentity(entry.url);
    if (seenFeeds.has(identity) || seenKeys.has(entry.key)) continue;
    seenFeeds.add(identity);
    seenKeys.add(entry.key);
    merged.push(entry);
  }
  return merged;
})();

export function findCatalogSource(key: string): CatalogSource | undefined {
  return TURKEY_SOURCE_CATALOG.find((entry) => entry.key === key);
}
