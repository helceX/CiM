/**
 * Public social feeds — the legitimate, login-free ways to read a platform.
 *
 * Mediaory never scrapes a social network and never logs in as somebody. What
 * it can read without credentials is the feed a platform (or an open-source
 * bridge the operator runs themselves) publishes on purpose: YouTube's channel
 * feed, Reddit's `.rss` pages, Mastodon's `.rss` pages, Bluesky's profile feed.
 * X, Instagram, TikTok and LinkedIn do not publish such feeds, so for them the
 * operator brings their own bridge (e.g. a self-hosted RSSHub) and its address
 * goes in through the generic "Custom feed" entry — the terms of the platform
 * are then the operator's to honour. See docs/product/SOCIAL_MEDIA.md.
 *
 * This module only turns "what I want to follow" into a feed address; the
 * admin form then fetch-tests that address before anything is stored.
 */
export type SocialFeedKind = {
  key: string;
  label: string;
  /** Label for the main input. */
  valueLabel: string;
  placeholder: string;
  /** Needs the server the account lives on (Mastodon) or the bridge address (RSSHub). */
  needsInstance?: boolean;
  instanceLabel?: string;
};

export type SocialFeedPlatform = {
  key: string;
  label: string;
  /** `Source.type` the feed is stored under (video platforms sit in their own cluster). */
  sourceType: "social" | "youtube";
  kinds: SocialFeedKind[];
};

export const SOCIAL_FEED_PLATFORMS: SocialFeedPlatform[] = [
  {
    key: "youtube",
    label: "YouTube",
    sourceType: "youtube",
    kinds: [
      { key: "channel", label: "Channel", valueLabel: "Channel ID or channel address", placeholder: "UCxxxxxxxxxxxxxxxxxxxxxx" },
      { key: "playlist", label: "Playlist", valueLabel: "Playlist ID or address", placeholder: "PLxxxxxxxxxxxxxxxx" },
    ],
  },
  {
    key: "reddit",
    label: "Reddit",
    sourceType: "social",
    kinds: [
      { key: "subreddit", label: "Community (subreddit)", valueLabel: "Community name", placeholder: "technology" },
      { key: "search", label: "Search for a keyword", valueLabel: "Keyword or phrase", placeholder: "Mediaory" },
      { key: "user", label: "User", valueLabel: "Username", placeholder: "spez" },
    ],
  },
  {
    key: "mastodon",
    label: "Mastodon",
    sourceType: "social",
    kinds: [
      {
        key: "hashtag",
        label: "Hashtag",
        valueLabel: "Hashtag",
        placeholder: "medya",
        needsInstance: true,
        instanceLabel: "Server",
      },
      {
        key: "user",
        label: "Account",
        valueLabel: "Username (without @)",
        placeholder: "gargron",
        needsInstance: true,
        instanceLabel: "Server",
      },
    ],
  },
  {
    key: "bluesky",
    label: "Bluesky",
    sourceType: "social",
    kinds: [{ key: "profile", label: "Profile", valueLabel: "Handle", placeholder: "name.bsky.social" }],
  },
  {
    key: "rsshub",
    label: "Your own RSSHub / bridge",
    sourceType: "social",
    kinds: [
      {
        key: "route",
        label: "Route",
        valueLabel: "Route path",
        placeholder: "/twitter/keyword/mediaory",
        needsInstance: true,
        instanceLabel: "Your bridge address",
      },
    ],
  },
];

export type SocialFeedRequest = {
  platform: string;
  kind: string;
  value: string;
  instance?: string;
};

export type SocialFeedResult =
  | { ok: true; url: string; name: string; sourceType: "social" | "youtube" }
  | { ok: false; error: string };

const HOST = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

function cleanHost(input: string | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, "").toLowerCase();
  return HOST.test(trimmed) ? trimmed : null;
}

const fail = (error: string): SocialFeedResult => ({ ok: false, error });

export function buildSocialFeed(request: SocialFeedRequest): SocialFeedResult {
  const platform = SOCIAL_FEED_PLATFORMS.find((entry) => entry.key === request.platform);
  const kind = platform?.kinds.find((entry) => entry.key === request.kind);
  if (!platform || !kind) return fail("Choose a platform and what to follow.");
  const raw = request.value.trim();
  if (!raw) return fail(`${kind.valueLabel} is required.`);
  const make = (url: string, name: string): SocialFeedResult => ({ ok: true, url, name, sourceType: platform.sourceType });

  switch (`${platform.key}:${kind.key}`) {
    case "youtube:channel": {
      const id = raw.match(/(UC[\w-]{22})/)?.[1];
      if (!id) {
        return fail(
          "Use the channel ID (starts with UC, 24 characters) or a /channel/UC… address. A @handle address does not contain it — open the channel's About page and copy the channel ID.",
        );
      }
      return make(`https://www.youtube.com/feeds/videos.xml?channel_id=${id}`, `YouTube · ${id}`);
    }
    case "youtube:playlist": {
      const id = raw.match(/(?:list=|^)((?:PL|UU|OL|FL|LL)[\w-]{10,40})/)?.[1];
      if (!id) return fail("Use the playlist ID (starts with PL) or a playlist address containing list=PL….");
      return make(`https://www.youtube.com/feeds/videos.xml?playlist_id=${id}`, `YouTube playlist · ${id}`);
    }
    case "reddit:subreddit": {
      const name = raw.replace(/^\/?r\//i, "");
      if (!/^[A-Za-z0-9_]{2,21}$/.test(name)) return fail("A subreddit name is 2–21 letters, digits or underscores.");
      return make(`https://www.reddit.com/r/${name}/.rss`, `Reddit · r/${name}`);
    }
    case "reddit:user": {
      const name = raw.replace(/^\/?u(?:ser)?\//i, "");
      if (!/^[A-Za-z0-9_-]{3,20}$/.test(name)) return fail("A Reddit username is 3–20 letters, digits, dashes or underscores.");
      return make(`https://www.reddit.com/user/${name}/.rss`, `Reddit · u/${name}`);
    }
    case "reddit:search": {
      if (raw.length > 100) return fail("Keep the search under 100 characters.");
      return make(`https://www.reddit.com/search.rss?q=${encodeURIComponent(raw)}&sort=new`, `Reddit search · ${raw}`);
    }
    case "mastodon:hashtag": {
      const host = cleanHost(request.instance);
      if (!host) return fail("Enter the Mastodon server, e.g. mastodon.social.");
      const tag = raw.replace(/^#/, "");
      if (!/^[\p{L}\p{N}_]{1,100}$/u.test(tag)) return fail("A hashtag is letters, digits and underscores only.");
      return make(`https://${host}/tags/${encodeURIComponent(tag)}.rss`, `Mastodon · #${tag} (${host})`);
    }
    case "mastodon:user": {
      const host = cleanHost(request.instance);
      if (!host) return fail("Enter the Mastodon server, e.g. mastodon.social.");
      const name = raw.replace(/^@/, "");
      if (!/^[A-Za-z0-9_.-]{1,60}$/.test(name)) return fail("Use the username without the server part.");
      return make(`https://${host}/@${name}.rss`, `Mastodon · @${name}@${host}`);
    }
    case "bluesky:profile": {
      const handle = raw.replace(/^@/, "").toLowerCase();
      if (!HOST.test(handle)) return fail("A Bluesky handle looks like name.bsky.social.");
      return make(`https://bsky.app/profile/${handle}/rss`, `Bluesky · @${handle}`);
    }
    case "rsshub:route": {
      const host = cleanHost(request.instance);
      if (!host) return fail("Enter the address of the RSSHub (or bridge) you run, e.g. rsshub.example.com.");
      if (!raw.startsWith("/") || raw.includes("..") || /\s/.test(raw)) return fail("A route starts with / and has no spaces, e.g. /twitter/keyword/mediaory.");
      return make(`https://${host}${raw}`, `Bridge · ${raw}`);
    }
    default:
      return fail("Choose a platform and what to follow.");
  }
}
