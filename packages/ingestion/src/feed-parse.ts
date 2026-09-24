import { XMLParser } from "fast-xml-parser";
import { htmlToPlainText } from "./html-text";

export type FeedItem = {
  externalId: string;
  canonicalUrl: string;
  title: string;
  bodyText: string;
  publishedAt: Date | null;
  authorName: string | null;
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  isArray: (name) => name === "item" || name === "entry",
});

function textOf(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  // fast-xml-parser represents a tag with both attributes and text content
  // (e.g. an Atom <link href="…">text</link>, or CDATA mixed with
  // sub-elements) as an object — `#text` is where the actual content is.
  if (typeof value === "object" && "#text" in (value as Record<string, unknown>)) {
    return textOf((value as Record<string, unknown>)["#text"]);
  }
  return "";
}

function parseDate(value: string): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function atomLink(entry: Record<string, unknown>): string {
  const link = entry.link;
  if (typeof link === "string") return link;
  if (Array.isArray(link)) {
    const alternate = link.find(
      (l) => typeof l === "object" && ((l as Record<string, unknown>)["@_rel"] ?? "alternate") === "alternate",
    ) as Record<string, unknown> | undefined;
    const chosen = alternate ?? (link[0] as Record<string, unknown> | undefined);
    return typeof chosen?.["@_href"] === "string" ? chosen["@_href"] : "";
  }
  if (link && typeof link === "object") {
    const href = (link as Record<string, unknown>)["@_href"];
    return typeof href === "string" ? href : "";
  }
  return "";
}

/**
 * docs/architecture/INGESTION.md `RSSConnector` — handles both RSS 2.0
 * (`<rss><channel><item>`) and Atom (`<feed><entry>`) since real-world
 * "RSS feeds" are frequently one or the other. Throws on unparseable XML
 * or a feed shape matching neither — the connector's `fetch` never
 * silently returns zero items for what was actually a parse failure.
 */
export function parseFeed(xml: string): FeedItem[] {
  const doc = parser.parse(xml) as Record<string, unknown>;

  const rssItems = (doc.rss as Record<string, unknown> | undefined)?.channel;
  if (rssItems && typeof rssItems === "object") {
    const items = (rssItems as Record<string, unknown>).item;
    const list = Array.isArray(items) ? items : items ? [items] : [];
    return list.map((raw) => {
      const item = raw as Record<string, unknown>;
      const link = textOf(item.link);
      const guid = textOf(item.guid) || link;
      const description = textOf(item["content:encoded"]) || textOf(item.description);
      return {
        externalId: guid,
        canonicalUrl: link,
        title: textOf(item.title),
        bodyText: htmlToPlainText(description),
        publishedAt: parseDate(textOf(item.pubDate)),
        authorName: textOf(item["dc:creator"]) || textOf(item.author) || null,
      };
    });
  }

  const atomFeed = doc.feed as Record<string, unknown> | undefined;
  if (atomFeed && typeof atomFeed === "object") {
    const entries = atomFeed.entry;
    const list = Array.isArray(entries) ? entries : entries ? [entries] : [];
    return list.map((raw) => {
      const entry = raw as Record<string, unknown>;
      const link = atomLink(entry);
      const id = textOf(entry.id) || link;
      const content = textOf(entry.content) || textOf(entry.summary);
      const author = entry.author as Record<string, unknown> | undefined;
      return {
        externalId: id,
        canonicalUrl: link,
        title: textOf(entry.title),
        bodyText: htmlToPlainText(content),
        publishedAt: parseDate(textOf(entry.updated) || textOf(entry.published)),
        authorName: author ? textOf(author.name) || null : null,
      };
    });
  }

  throw new Error("Unrecognized feed format: expected RSS <rss><channel> or Atom <feed>");
}
