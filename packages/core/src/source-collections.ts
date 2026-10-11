import { inferCountryFromSource } from "./country-from-host";
import { TURKEY_SOURCE_CATALOG } from "./source-catalog";
import { WORLD_SOURCE_CATALOG } from "./world-catalog";

export type CrawlCollection = "turkey" | "startup";
export type CollectionSource = {
  name: string;
  domain: string;
  url: string | null;
  country: string | null;
  language: string | null;
};

function identity(url: string): string {
  try {
    const value = new URL(url);
    value.hash = "";
    return value.href.replace(/\/$/, "");
  } catch {
    return url;
  }
}

const turkishFeeds = new Set(TURKEY_SOURCE_CATALOG.map((s) => identity(s.url)));
const startupFeeds = new Set(
  WORLD_SOURCE_CATALOG.filter((s) => s.group === "startup").map((s) => identity(s.url)),
);
const columnistFeeds = new Set(
  TURKEY_SOURCE_CATALOG.filter((s) => s.group === "columns").map((s) =>
    identity(s.url),
  ),
);
const STARTUP_CUE =
  /(?:^|[^a-z])(?:startups?|entrepreneur(?:ship)?|incubators?|accelerators?|funding|grants?|venture[\s/-]+capital|angel[\s/-]+invest(?:or|ment)s?|seed[\s/-]+funding|girişim(?:cilik)?|girisim(?:cilik)?|kuluçka|kulucka|hibe|teknopark)(?:$|[^a-z])/iu;
const STARTUP_HOST =
  /(?:^|\.)(?:techcrunch\.com|crunchbase\.com|venturebeat\.com|sifted\.eu|eu-startups\.com|ycombinator\.com|startup[^.]*\.[a-z.]+|mixergy\.com|webrazzi\.com|foundern\.com|swipeline\.co)$/i;

/** Server-side catalog classification; never downloads a feed or changes publisher permissions. */
export function sourceCollections(source: CollectionSource): CrawlCollection[] {
  const url = source.url ? identity(source.url) : "";
  let decoded = source.url ?? "";
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    /* malformed URL remains a hint only */
  }
  const language = source.language?.trim().toLowerCase() ?? "";
  const explicitTurkish =
    /^(?:tr(?:$|[-_])|turkish$|türkçe$|turkce$)/u.test(language) ||
    /(?:\/|[?&](?:lang|language)=)(?:tr(?:-tr)?|turkce|türkçe|turkish)(?:\/|[?&#]|$)/iu.test(
      decoded,
    ) ||
    /^tr\./i.test(source.domain);
  const result: CrawlCollection[] = [];
  if (
    source.country === "TR" ||
    explicitTurkish ||
    turkishFeeds.has(url) ||
    inferCountryFromSource(source) === "TR"
  )
    result.push("turkey");
  if (
    startupFeeds.has(url) ||
    STARTUP_CUE.test(`${source.name} ${decoded}`) ||
    STARTUP_HOST.test(source.domain) ||
    /how i built this/i.test(source.name)
  )
    result.push("startup");
  return result;
}

/** Preserve the earlier decision to leave individual columnist feeds paused. */
export function isColumnistFeed(source: CollectionSource): boolean {
  return Boolean(source.url && columnistFeeds.has(identity(source.url)));
}
