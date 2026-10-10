/** Public feed URL builders. Reachability is not commercial access permission; see SOCIAL_MEDIA.md. */
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
  note?: string;
  kinds: SocialFeedKind[];
};

export const SOCIAL_FEED_PLATFORMS: SocialFeedPlatform[] = [
  {
    key: "youtube",
    label: "YouTube",
    sourceType: "youtube",
    kinds: [
      {
        key: "channel",
        label: "Channel",
        valueLabel: "Channel ID or channel address",
        placeholder: "UCxxxxxxxxxxxxxxxxxxxxxx",
      },
      {
        key: "playlist",
        label: "Playlist",
        valueLabel: "Playlist ID or address",
        placeholder: "PLxxxxxxxxxxxxxxxx",
      },
    ],
  },
  {
    key: "reddit",
    label: "Reddit",
    sourceType: "social",
    note: "Reddit requires approval for data access; commercial use may require a separate agreement. A working RSS URL does not grant that permission. Do not enable without confirming your access.",
    kinds: [
      {
        key: "subreddit",
        label: "Community (subreddit)",
        valueLabel: "Community name",
        placeholder: "technology",
      },
      {
        key: "search",
        label: "Search for a keyword",
        valueLabel: "Keyword or phrase",
        placeholder: "Mediaory",
      },
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
    kinds: [
      {
        key: "profile",
        label: "Profile",
        valueLabel: "Handle",
        placeholder: "name.bsky.social",
      },
    ],
  },
  {
    key: "github",
    label: "GitHub",
    sourceType: "social",
    note: "Public repository releases only; no private repositories or account credentials.",
    kinds: [
      {
        key: "releases",
        label: "Releases",
        valueLabel: "Public repository (owner/name)",
        placeholder: "RSS-Bridge/rss-bridge",
      },
    ],
  },
  {
    key: "discourse",
    label: "Discourse forums",
    sourceType: "social",
    note: "Public forum topics only. Private categories and authenticated feeds are excluded.",
    kinds: [
      {
        key: "tag",
        label: "Tag",
        valueLabel: "Tag",
        placeholder: "announcements",
        needsInstance: true,
        instanceLabel: "Public forum server",
      },
    ],
  },
  {
    key: "rsshub",
    label: "Your own RSSHub / bridge",
    sourceType: "social",
    note: "An open-source bridge is not a licence to collect platform data. Use only feeds you are authorised to read. No bridge hosting, login cookies, paid API or browser scraping is provided by Mediaory.",
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

export const RESTRICTED_SOCIAL_FEED_PLATFORMS = [
  {
    key: "instagram",
    label: "Instagram",
    note: "Official API and account permissions required; no public RSS connector.",
  },
  {
    key: "x",
    label: "X / Twitter",
    note: "Official reads are pay-per-use; excluded from the free feed setup.",
  },
  {
    key: "linkedin",
    label: "LinkedIn",
    note: "Approved API access required; no public RSS connector.",
  },
  {
    key: "facebook",
    label: "Facebook",
    note: "Official Pages access and permissions required; no public RSS connector.",
  },
] as const;

export type SocialFeedResult =
  | { ok: true; url: string; name: string; sourceType: "social" | "youtube" }
  | { ok: false; error: string };

const HOST = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

function cleanHost(input: string | undefined): string | null {
  if (!input) return null;
  const trimmed = input
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .toLowerCase();
  return HOST.test(trimmed) ? trimmed : null;
}

const fail = (error: string): SocialFeedResult => ({ ok: false, error });

export function buildSocialFeed(request: SocialFeedRequest): SocialFeedResult {
  const platform = SOCIAL_FEED_PLATFORMS.find(
    (entry) => entry.key === request.platform,
  );
  const kind = platform?.kinds.find((entry) => entry.key === request.kind);
  if (!platform || !kind) return fail("Choose a platform and what to follow.");
  const raw = request.value.trim();
  if (!raw) return fail(`${kind.valueLabel} is required.`);
  const make = (url: string, name: string): SocialFeedResult => ({
    ok: true,
    url,
    name,
    sourceType: platform.sourceType,
  });

  switch (`${platform.key}:${kind.key}`) {
    case "github:releases": {
      const match = raw.match(
        /^(?:https:\/\/github\.com\/)?([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/([A-Za-z0-9_.-]{1,100})(?:\/releases(?:\.atom)?)?\/?$/,
      );
      if (!match || match[2] === "." || match[2] === "..")
        return fail("Use a public GitHub repository in owner/name format.");
      const repository = `${match[1]}/${match[2]}`;
      return make(
        `https://github.com/${repository}/releases.atom`,
        `GitHub releases · ${repository}`,
      );
    }
    case "discourse:tag": {
      const host = cleanHost(request.instance);
      if (!host)
        return fail(
          "Enter the public Discourse forum server, e.g. meta.discourse.org.",
        );
      const tag = raw.replace(/^#/, "");
      if (!/^[\p{L}\p{N}_-]{1,100}$/u.test(tag))
        return fail("A forum tag contains letters, digits, dashes or underscores.");
      return make(
        `https://${host}/tag/${encodeURIComponent(tag)}.rss`,
        `Discourse · #${tag} (${host})`,
      );
    }
    case "youtube:channel": {
      const id = raw.match(/(UC[\w-]{22})/)?.[1];
      if (!id) {
        return fail(
          "Use the channel ID (starts with UC, 24 characters) or a /channel/UC… address. A @handle address does not contain it — open the channel's About page and copy the channel ID.",
        );
      }
      return make(
        `https://www.youtube.com/feeds/videos.xml?channel_id=${id}`,
        `YouTube · ${id}`,
      );
    }
    case "youtube:playlist": {
      const id = raw.match(/(?:list=|^)((?:PL|UU|OL|FL|LL)[\w-]{10,40})/)?.[1];
      if (!id)
        return fail(
          "Use the playlist ID (starts with PL) or a playlist address containing list=PL….",
        );
      return make(
        `https://www.youtube.com/feeds/videos.xml?playlist_id=${id}`,
        `YouTube playlist · ${id}`,
      );
    }
    case "reddit:subreddit": {
      const name = raw.replace(/^\/?r\//i, "");
      if (!/^[A-Za-z0-9_]{2,21}$/.test(name))
        return fail("A subreddit name is 2–21 letters, digits or underscores.");
      return make(`https://www.reddit.com/r/${name}/.rss`, `Reddit · r/${name}`);
    }
    case "reddit:user": {
      const name = raw.replace(/^\/?u(?:ser)?\//i, "");
      if (!/^[A-Za-z0-9_-]{3,20}$/.test(name))
        return fail(
          "A Reddit username is 3–20 letters, digits, dashes or underscores.",
        );
      return make(`https://www.reddit.com/user/${name}/.rss`, `Reddit · u/${name}`);
    }
    case "reddit:search": {
      if (raw.length > 100) return fail("Keep the search under 100 characters.");
      return make(
        `https://www.reddit.com/search.rss?q=${encodeURIComponent(raw)}&sort=new`,
        `Reddit search · ${raw}`,
      );
    }
    case "mastodon:hashtag": {
      const host = cleanHost(request.instance);
      if (!host) return fail("Enter the Mastodon server, e.g. mastodon.social.");
      const tag = raw.replace(/^#/, "");
      if (!/^[\p{L}\p{N}_]{1,100}$/u.test(tag))
        return fail("A hashtag is letters, digits and underscores only.");
      return make(
        `https://${host}/tags/${encodeURIComponent(tag)}.rss`,
        `Mastodon · #${tag} (${host})`,
      );
    }
    case "mastodon:user": {
      const host = cleanHost(request.instance);
      if (!host) return fail("Enter the Mastodon server, e.g. mastodon.social.");
      const name = raw.replace(/^@/, "");
      if (!/^[A-Za-z0-9_.-]{1,60}$/.test(name))
        return fail("Use the username without the server part.");
      return make(`https://${host}/@${name}.rss`, `Mastodon · @${name}@${host}`);
    }
    case "bluesky:profile": {
      const handle = raw.replace(/^@/, "").toLowerCase();
      if (!HOST.test(handle))
        return fail("A Bluesky handle looks like name.bsky.social.");
      return make(`https://bsky.app/profile/${handle}/rss`, `Bluesky · @${handle}`);
    }
    case "rsshub:route": {
      const host = cleanHost(request.instance);
      if (!host)
        return fail(
          "Enter the address of the RSSHub (or bridge) you run, e.g. rsshub.example.com.",
        );
      if (!raw.startsWith("/") || raw.includes("..") || /\s/.test(raw))
        return fail(
          "A route starts with / and has no spaces, e.g. /twitter/keyword/mediaory.",
        );
      return make(`https://${host}${raw}`, `Bridge · ${raw}`);
    }
    default:
      return fail("Choose a platform and what to follow.");
  }
}
