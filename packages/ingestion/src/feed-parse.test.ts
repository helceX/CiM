import { describe, expect, it } from "vitest";
import { parseFeed } from "./feed-parse";

const RSS_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Example Wire</title>
    <item>
      <title>Northwind announces quarterly results</title>
      <link>https://example.com/articles/1</link>
      <guid>urn:example:1</guid>
      <pubDate>Mon, 21 Sep 2026 10:00:00 GMT</pubDate>
      <dc:creator>Jane Reporter</dc:creator>
      <description><![CDATA[<p>Full <b>body</b> text here.</p>]]></description>
    </item>
    <item>
      <title>Second story</title>
      <link>https://example.com/articles/2</link>
      <guid>urn:example:2</guid>
      <pubDate>Tue, 22 Sep 2026 09:00:00 GMT</pubDate>
      <description>Plain text body.</description>
    </item>
  </channel>
</rss>`;

const RSS_SINGLE_ITEM = `<rss version="2.0"><channel><title>X</title>
  <item><title>Only one</title><link>https://example.com/only</link><guid>only-1</guid></item>
</channel></rss>`;

const ATOM_FEED = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Example Atom Feed</title>
  <entry>
    <title>Atom entry one</title>
    <link rel="alternate" href="https://example.com/atom/1"/>
    <id>tag:example.com,2026:1</id>
    <updated>2026-09-21T10:00:00Z</updated>
    <author><name>Alex Author</name></author>
    <content type="html">&lt;p&gt;Atom body&lt;/p&gt;</content>
  </entry>
</feed>`;

describe("parseFeed — RSS", () => {
  it("parses multiple items with all fields", () => {
    const items = parseFeed(RSS_FEED);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      externalId: "urn:example:1",
      canonicalUrl: "https://example.com/articles/1",
      title: "Northwind announces quarterly results",
      bodyText: "Full body text here.",
      authorName: "Jane Reporter",
    });
    expect(items[0]!.publishedAt).toBeInstanceOf(Date);
    expect(items[1]!.authorName).toBeNull();
  });

  it("still returns an array for a feed with exactly one item", () => {
    const items = parseFeed(RSS_SINGLE_ITEM);
    expect(items).toHaveLength(1);
    expect(items[0]!.canonicalUrl).toBe("https://example.com/only");
  });
});

describe("parseFeed — Atom", () => {
  it("parses entries", () => {
    const items = parseFeed(ATOM_FEED);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      externalId: "tag:example.com,2026:1",
      canonicalUrl: "https://example.com/atom/1",
      title: "Atom entry one",
      bodyText: "Atom body",
      authorName: "Alex Author",
    });
  });
});

describe("parseFeed — errors", () => {
  it("throws on an unrecognized document shape", () => {
    expect(() => parseFeed("<not-a-feed><x/></not-a-feed>")).toThrow(/[Uu]nrecognized feed/);
  });
});
