import { isAllowedByRobotsTxt } from "./robots";
import { safeFetch, SsrfBlockedError } from "./safe-fetch";
import { testSourceUrl, type SourceTestResult } from "./source-test";

export type FeedDiscovery =
  | { ok: true; feedUrl: string; itemCount: number }
  | { ok: false; message: string };

export type DiscoveryDeps = {
  fetchPage?: (url: string) => Promise<{ status: number; body: string; finalUrl: string }>;
  testFeed?: (url: string) => Promise<SourceTestResult>;
  allowedByRobots?: (url: string) => Promise<boolean>;
};

/** Where a site most often keeps its feed when the page does not advertise one. */
const COMMON_PATHS = ["/feed/", "/feed", "/rss", "/rss.xml", "/index.xml", "/atom.xml"];
/** Pages are small; a site's head tags are all that is read. */
const MAX_TESTS = 6;

const LINK_TAG = /<link\b[^>]*>/gi;

function attribute(tag: string, name: string): string | null {
  const match = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
  return match ? (match[2] ?? match[3] ?? match[4] ?? "").trim() : null;
}

/** Feed addresses a page advertises with <link rel="alternate" type="application/rss+xml|atom+xml">. */
export function advertisedFeeds(html: string, pageUrl: string): string[] {
  const found: string[] = [];
  for (const tag of html.slice(0, 200_000).match(LINK_TAG) ?? []) {
    const rel = attribute(tag, "rel")?.toLowerCase().split(/\s+/) ?? [];
    const type = attribute(tag, "type")?.toLowerCase() ?? "";
    const href = attribute(tag, "href");
    if (!href || !rel.includes("alternate") || !/(rss|atom)\+xml|application\/xml|text\/xml/.test(type)) continue;
    try {
      const url = new URL(href.replace(/&amp;/g, "&"), pageUrl);
      if (url.protocol === "https:" && !found.includes(url.toString())) found.push(url.toString());
    } catch {
      // not a usable address
    }
  }
  return found;
}

/**
 * Finds a working RSS/Atom feed for a site that only has a web page in the catalog.
 *
 * Polite by construction: the page is read only when robots.txt does not forbid
 * Mediaory-Bot, the same SSRF-guarded client as the crawler is used, at most
 * {@link MAX_TESTS} feed addresses are tried, and a feed is accepted only when it
 * parses with at least one item (the same test an operator's "add source" runs).
 * Comment feeds are skipped — they are not the site's stories.
 */
export async function discoverFeed(pageUrl: string, deps: DiscoveryDeps = {}): Promise<FeedDiscovery> {
  const fetchPage =
    deps.fetchPage ??
    (async (url: string) => {
      const result = await safeFetch(url, { timeoutMs: 8000, maxResponseBytes: 400_000 });
      return { status: result.status, body: result.body, finalUrl: result.finalUrl };
    });
  const testFeed = deps.testFeed ?? ((url: string) => testSourceUrl(url, "rss"));
  const allowedByRobots = deps.allowedByRobots ?? isAllowedByRobotsTxt;

  let base: URL;
  try {
    base = new URL(pageUrl);
    if (base.protocol !== "https:") base.protocol = "https:";
  } catch {
    return { ok: false, message: "Not a web address." };
  }

  try {
    if (!(await allowedByRobots(base.toString()))) return { ok: false, message: "robots.txt asks bots to stay away." };

    const candidates: string[] = [];
    const add = (url: string) => {
      if (!candidates.includes(url) && !/\/comments\/feed/i.test(url)) candidates.push(url);
    };
    const page = await fetchPage(base.toString());
    if (page.status < 400) {
      for (const url of advertisedFeeds(page.body, page.finalUrl || base.toString())) add(url);
    }
    for (const path of COMMON_PATHS) add(new URL(path, base.origin).toString());

    for (const url of candidates.slice(0, MAX_TESTS)) {
      const test = await testFeed(url);
      if (test.ok) return { ok: true, feedUrl: url, itemCount: test.itemCount };
    }
    return { ok: false, message: "No readable feed was found." };
  } catch (error) {
    if (error instanceof SsrfBlockedError) return { ok: false, message: "That address is not allowed." };
    return { ok: false, message: error instanceof Error ? `Could not read it: ${error.message}` : "Could not read it." };
  }
}
