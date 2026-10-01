import { describe, expect, it } from "vitest";
import { buildSocialFeed } from "./social-feeds";

const url = (r: ReturnType<typeof buildSocialFeed>) => (r.ok ? r.url : r.error);

describe("buildSocialFeed", () => {
  it("builds a YouTube channel feed from an id or a /channel/ address", () => {
    const id = "UC_x5XG1OV2P6uZZ5FSM9Ttw";
    expect(url(buildSocialFeed({ platform: "youtube", kind: "channel", value: id }))).toBe(
      `https://www.youtube.com/feeds/videos.xml?channel_id=${id}`,
    );
    expect(url(buildSocialFeed({ platform: "youtube", kind: "channel", value: `https://www.youtube.com/channel/${id}` }))).toContain(id);
    const handle = buildSocialFeed({ platform: "youtube", kind: "channel", value: "https://www.youtube.com/@google" });
    expect(handle.ok).toBe(false);
  });

  it("files YouTube under the video cluster and the rest under social", () => {
    const yt = buildSocialFeed({ platform: "youtube", kind: "playlist", value: "PLbpi6ZahtOH6Blw3RGYpWkSByi_T7Rygb" });
    expect(yt.ok && yt.sourceType).toBe("youtube");
    const reddit = buildSocialFeed({ platform: "reddit", kind: "subreddit", value: "r/technology" });
    expect(reddit.ok && reddit.sourceType).toBe("social");
    expect(url(reddit)).toBe("https://www.reddit.com/r/technology/.rss");
  });

  it("encodes Reddit searches and rejects bad names", () => {
    expect(url(buildSocialFeed({ platform: "reddit", kind: "search", value: "a b&c" }))).toBe(
      "https://www.reddit.com/search.rss?q=a%20b%26c&sort=new",
    );
    expect(buildSocialFeed({ platform: "reddit", kind: "subreddit", value: "../x" }).ok).toBe(false);
    expect(buildSocialFeed({ platform: "reddit", kind: "user", value: "ab" }).ok).toBe(false);
  });

  it("builds Mastodon and Bluesky feeds and validates the server", () => {
    expect(url(buildSocialFeed({ platform: "mastodon", kind: "hashtag", value: "#medya", instance: "https://Mastodon.Social/" }))).toBe(
      "https://mastodon.social/tags/medya.rss",
    );
    expect(url(buildSocialFeed({ platform: "mastodon", kind: "user", value: "@gargron", instance: "mastodon.social" }))).toBe(
      "https://mastodon.social/@gargron.rss",
    );
    expect(buildSocialFeed({ platform: "mastodon", kind: "hashtag", value: "x", instance: "localhost" }).ok).toBe(false);
    expect(url(buildSocialFeed({ platform: "bluesky", kind: "profile", value: "@Name.bsky.social" }))).toBe(
      "https://bsky.app/profile/name.bsky.social/rss",
    );
  });

  it("joins a bridge address and route, refusing traversal", () => {
    expect(url(buildSocialFeed({ platform: "rsshub", kind: "route", value: "/twitter/keyword/mediaory", instance: "rsshub.example.com" }))).toBe(
      "https://rsshub.example.com/twitter/keyword/mediaory",
    );
    expect(buildSocialFeed({ platform: "rsshub", kind: "route", value: "/../x", instance: "rsshub.example.com" }).ok).toBe(false);
    expect(buildSocialFeed({ platform: "rsshub", kind: "route", value: "twitter", instance: "rsshub.example.com" }).ok).toBe(false);
  });

  it("rejects an unknown platform or empty input", () => {
    expect(buildSocialFeed({ platform: "nope", kind: "x", value: "y" }).ok).toBe(false);
    expect(buildSocialFeed({ platform: "reddit", kind: "search", value: "  " }).ok).toBe(false);
  });
});
