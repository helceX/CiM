import { describe, expect, it } from "vitest";
import { buildSocialFeed } from "./social-feeds";

const url = (r: ReturnType<typeof buildSocialFeed>) => (r.ok ? r.url : r.error);

describe("buildSocialFeed", () => {
  it("builds a YouTube channel feed from an id or a /channel/ address", () => {
    const id = "UC_x5XG1OV2P6uZZ5FSM9Ttw";
    expect(
      url(buildSocialFeed({ platform: "youtube", kind: "channel", value: id })),
    ).toBe(`https://www.youtube.com/feeds/videos.xml?channel_id=${id}`);
    expect(
      url(
        buildSocialFeed({
          platform: "youtube",
          kind: "channel",
          value: `https://www.youtube.com/channel/${id}`,
        }),
      ),
    ).toContain(id);
    const handle = buildSocialFeed({
      platform: "youtube",
      kind: "channel",
      value: "https://www.youtube.com/@google",
    });
    expect(handle.ok).toBe(false);
  });

  it("files YouTube under the video cluster and the rest under social", () => {
    const yt = buildSocialFeed({
      platform: "youtube",
      kind: "playlist",
      value: "PLbpi6ZahtOH6Blw3RGYpWkSByi_T7Rygb",
    });
    expect(yt.ok && yt.sourceType).toBe("youtube");
    const reddit = buildSocialFeed({
      platform: "reddit",
      kind: "subreddit",
      value: "r/technology",
    });
    expect(reddit.ok && reddit.sourceType).toBe("social");
    expect(url(reddit)).toBe("https://www.reddit.com/r/technology/.rss");
  });

  it("encodes Reddit searches and rejects bad names", () => {
    expect(
      url(buildSocialFeed({ platform: "reddit", kind: "search", value: "a b&c" })),
    ).toBe("https://www.reddit.com/search.rss?q=a%20b%26c&sort=new");
    expect(
      buildSocialFeed({ platform: "reddit", kind: "subreddit", value: "../x" }).ok,
    ).toBe(false);
    expect(buildSocialFeed({ platform: "reddit", kind: "user", value: "ab" }).ok).toBe(
      false,
    );
  });

  it("builds Mastodon and Bluesky feeds and validates the server", () => {
    expect(
      url(
        buildSocialFeed({
          platform: "mastodon",
          kind: "hashtag",
          value: "#medya",
          instance: "https://Mastodon.Social/",
        }),
      ),
    ).toBe("https://mastodon.social/tags/medya.rss");
    expect(
      url(
        buildSocialFeed({
          platform: "mastodon",
          kind: "user",
          value: "@gargron",
          instance: "mastodon.social",
        }),
      ),
    ).toBe("https://mastodon.social/@gargron.rss");
    expect(
      buildSocialFeed({
        platform: "mastodon",
        kind: "hashtag",
        value: "x",
        instance: "localhost",
      }).ok,
    ).toBe(false);
    expect(
      url(
        buildSocialFeed({
          platform: "bluesky",
          kind: "profile",
          value: "@Name.bsky.social",
        }),
      ),
    ).toBe("https://bsky.app/profile/name.bsky.social/rss");
  });

  it("joins a bridge address and route, refusing traversal", () => {
    expect(
      url(
        buildSocialFeed({
          platform: "rsshub",
          kind: "route",
          value: "/twitter/keyword/mediaory",
          instance: "rsshub.example.com",
        }),
      ),
    ).toBe("https://rsshub.example.com/twitter/keyword/mediaory");
    expect(
      buildSocialFeed({
        platform: "rsshub",
        kind: "route",
        value: "/../x",
        instance: "rsshub.example.com",
      }).ok,
    ).toBe(false);
    expect(
      buildSocialFeed({
        platform: "rsshub",
        kind: "route",
        value: "twitter",
        instance: "rsshub.example.com",
      }).ok,
    ).toBe(false);
  });

  it("rejects an unknown platform or empty input", () => {
    expect(buildSocialFeed({ platform: "nope", kind: "x", value: "y" }).ok).toBe(false);
    expect(
      buildSocialFeed({ platform: "reddit", kind: "search", value: "  " }).ok,
    ).toBe(false);
  });

  it("builds public GitHub release feeds without accepting arbitrary hosts or traversal", () => {
    expect(
      url(
        buildSocialFeed({
          platform: "github",
          kind: "releases",
          value: "https://github.com/RSS-Bridge/rss-bridge/releases",
        }),
      ),
    ).toBe("https://github.com/RSS-Bridge/rss-bridge/releases.atom");
    for (const value of [
      "https://evil.example/owner/repo",
      "owner/..",
      "owner/repo?token=secret",
      "owner/repo/../../private",
    ]) {
      expect(buildSocialFeed({ platform: "github", kind: "releases", value }).ok).toBe(
        false,
      );
    }
  });

  it("encodes public forum tags and rejects path injection and local servers", () => {
    expect(
      url(
        buildSocialFeed({
          platform: "discourse",
          kind: "tag",
          value: "#duyuru",
          instance: "meta.discourse.org",
        }),
      ),
    ).toBe("https://meta.discourse.org/tag/duyuru.rss");
    expect(
      buildSocialFeed({
        platform: "discourse",
        kind: "tag",
        value: "../private",
        instance: "meta.discourse.org",
      }).ok,
    ).toBe(false);
    expect(
      buildSocialFeed({
        platform: "discourse",
        kind: "tag",
        value: "news",
        instance: "localhost",
      }).ok,
    ).toBe(false);
  });

  it("never turns a restricted network into a paid or scraping route", () => {
    for (const platform of ["instagram", "x", "linkedin", "facebook"]) {
      expect(buildSocialFeed({ platform, kind: "profile", value: "mediaory" }).ok).toBe(
        false,
      );
    }
  });

  it("uses the upstream Telegram bridge contract and preserves subdirectory installations", () => {
    const request = {
      platform: "rssbridge",
      kind: "telegram",
      instance: "https://feeds.example.com/bridge/",
    };
    for (const value of [
      "rssbridge",
      "@rssbridge",
      "https://t.me/s/rssbridge",
      "https://telegram.me/rssbridge/",
    ]) {
      const result = buildSocialFeed({ ...request, value });
      expect(result.ok).toBe(true);
      const built = new URL(url(result));
      expect(built.origin).toBe("https://feeds.example.com");
      expect(built.pathname).toBe("/bridge/");
      expect(Object.fromEntries(built.searchParams)).toEqual({
        action: "display",
        bridge: "Telegram",
        username: "rssbridge",
        format: "Atom",
      });
    }
    for (const value of [
      "https://t.me/+invite",
      "https://t.me/c/123/4",
      "https://evil.example/rssbridge",
      "rssbridge?bridge=Other",
      "../secret",
      "ab",
    ]) {
      expect(buildSocialFeed({ ...request, value }).ok).toBe(false);
    }
  });

  it("refuses credential-bearing, private and non-HTTPS bridge addresses", () => {
    for (const instance of [
      "http://feeds.example.com",
      "https://user:secret@feeds.example.com",
      "https://localhost",
      "https://127.0.0.1",
      "https://feeds.example.com?token=secret",
      "https://feeds.example.com#secret",
      "https://feeds.example.com:8080",
      "https://feeds.example.com\\evil",
    ]) {
      expect(
        buildSocialFeed({
          platform: "rssbridge",
          kind: "telegram",
          value: "rssbridge",
          instance,
        }).ok,
      ).toBe(false);
      expect(
        buildSocialFeed({
          platform: "rsshub",
          kind: "route",
          value: "/test/path",
          instance,
        }).ok,
      ).toBe(false);
    }
  });

  it("keeps RSSHub installs under their path and rejects encoded route traversal", () => {
    expect(
      url(
        buildSocialFeed({
          platform: "rsshub",
          kind: "route",
          value: "/mastodon/test",
          instance: "feeds.example.com/rsshub/",
        }),
      ),
    ).toBe("https://feeds.example.com/rsshub/mastodon/test");
    for (const value of [
      "//evil.example/feed",
      "/%2e%2e/private",
      "/%252e%252e/private",
      "/%2fprivate",
      "/x\\private",
      "/feed#secret",
    ]) {
      expect(
        buildSocialFeed({
          platform: "rsshub",
          kind: "route",
          value,
          instance: "feeds.example.com",
        }).ok,
      ).toBe(false);
    }
  });

  it("accepts public Bluesky profile addresses but rejects unrelated hosts and post URLs", () => {
    expect(
      url(
        buildSocialFeed({
          platform: "bluesky",
          kind: "profile",
          value: "https://bsky.app/profile/name.bsky.social/",
        }),
      ),
    ).toBe("https://bsky.app/profile/name.bsky.social/rss");
    for (const value of [
      "https://evil.example/name.bsky.social",
      "https://bsky.app/profile/name.bsky.social/post/123",
      "name.bsky.social?token=secret",
    ]) {
      expect(buildSocialFeed({ platform: "bluesky", kind: "profile", value }).ok).toBe(
        false,
      );
    }
  });

  it("builds public forum category feeds without accepting path or query injection", () => {
    expect(
      url(
        buildSocialFeed({
          platform: "discourse",
          kind: "category",
          value: "7",
          instance: "meta.discourse.org",
        }),
      ),
    ).toBe("https://meta.discourse.org/c/-/7.rss");
    for (const value of [
      "0",
      "-1",
      "7/private",
      "7?token=secret",
      "7.1",
      "1000000000",
    ]) {
      expect(
        buildSocialFeed({
          platform: "discourse",
          kind: "category",
          value,
          instance: "meta.discourse.org",
        }).ok,
      ).toBe(false);
    }
  });
});
