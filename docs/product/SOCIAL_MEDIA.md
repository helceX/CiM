# Social media in Mediaory

What can be monitored, how, and what it needs from the operator. Short version:
**Mediaory never scrapes a social network and never signs in as somebody.** There
are three legitimate routes, and each is built or planned separately.

| Route | Who sets it up | Platforms | Needs |
|---|---|---|---|
| 1. Public feeds | Platform admin (Admin → Sources → Social feeds) | YouTube, Reddit, Mastodon, Bluesky | Nothing — no keys |
| 2. Your own bridge | Platform admin | X, Instagram, TikTok, LinkedIn (whatever the bridge supports) | A self-hosted RSSHub (or similar) and the operator's own credentials there |
| 3. Connected accounts | Each customer (Settings → Connected accounts) | YouTube, X (first), more later | A developer app per platform, keys in Railway Variables |

## 1. Public feeds (built)

Admin → Sources → **Social feeds**. Pick a platform and what to follow; the feed
address is built and **fetch-tested before it is stored**.

| Platform | What you can follow | Feed used |
|---|---|---|
| YouTube | channel, playlist | `youtube.com/feeds/videos.xml?channel_id=…` |
| Reddit | community, user, keyword search | `reddit.com/r/<name>/.rss`, `search.rss?q=…` |
| Mastodon | hashtag, account (any server) | `<server>/tags/<tag>.rss`, `<server>/@<user>.rss` |
| Bluesky | profile | `bsky.app/profile/<handle>/rss` |

Stored as `Source.type = social` (YouTube: `youtube`), connector `rss`, so they
crawl on the same two-hour rhythm as every other feed and appear in the Social
cluster of the Mentions page with a *Social* / *YouTube* badge. A customer's
keywords match against them like any other source.

Limits worth knowing:

- YouTube's feed needs the **channel ID** (`UC…`); a `@handle` does not contain it.
- Reddit throttles shared data-centre addresses. If the test fails with 403/429,
  the feed is not stored — try again later or use your own bridge.
- A feed returns the latest ~15–25 items; it is not a search of history.

## 2. Your own bridge (X, Instagram, TikTok, LinkedIn)

These networks publish no feeds. An open-source bridge such as
[RSSHub](https://github.com/DIYgod/RSSHub) can turn them into feeds, but it works
by scraping or by using **your own** credentials, which is against those
platforms' terms unless you use their official API. Mediaory does not run such a
bridge. If you choose to run one, add its routes under *Your own RSSHub / bridge*;
the platform terms are then yours to honour. Never paste a key or cookie into a
chat, an issue or an email — set it as a variable in the bridge's own hosting.

## 3. Connected accounts (planned in the next change)

Customers connect their *own* account by OAuth, and Mediaory reads only what that
account is allowed to see — comments on their videos, mentions and tags of their
handle — and sends a notification that links straight to the post. See the
platform table in that change's documentation for the developer apps needed.
