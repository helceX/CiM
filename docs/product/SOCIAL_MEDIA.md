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

## 3. Connected accounts (built: YouTube, X; more as approvals land)

Customers link **their own** account under **Settings → Connected accounts**
(owner/admin). Mediaory then reads — through the platform's official API, with
the customer's own OAuth grant, read-only scopes — what that account may see, and
tells them with a notification that **opens the post itself**. Everything collected
also lists under **Social → Mentions & tags** (`/social/mentions`).

| Platform | What is read | Poll | Cost / limit |
|---|---|---|---|
| YouTube | New comments on the connected channel's videos | every 15 min | 1 quota unit per poll; 10,000 units/day per Google project |
| X | Posts that mention the connected account | every 30 min | Pay-per-use: ~US$0.005 per post read, billed to *your* X developer account |
| Instagram, Facebook, LinkedIn, TikTok | — (listed as "coming next") | — | Each needs an app review / programme approval first |

Honest limits: no network offers a public "everyone who mentioned a keyword" search
for free (X's is paid, Instagram's hashtag search is capped at 30 hashtags/week,
LinkedIn and TikTok have none for companies). Connected accounts therefore cover
*your own* mentions, tags and comments; brand-wide keyword monitoring comes from
the public feeds (route 1), your own bridge (route 2), or — later — a licensed
data provider through the existing "Clipping / data provider (JSON API)" source.

### What the operator sets up (Railway → web **and** worker → Variables)

Never paste a key into chat, an issue or an e-mail — only into Railway Variables.

| Variable | Where it comes from |
|---|---|
| `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET` | Google Cloud Console → new project → enable **YouTube Data API v3** → OAuth consent screen (scope `youtube.readonly`; "Testing" works for up to 100 named users, publishing needs Google's verification) → Credentials → OAuth client ID, type *Web application*. Authorized redirect URI: `https://mediaory.io/api/social/callback/youtube` |
| `X_CLIENT_ID`, `X_CLIENT_SECRET` | developer.x.com → project + app → *User authentication settings*: OAuth 2.0, type *Web App*, callback `https://mediaory.io/api/social/callback/x`, scopes `tweet.read users.read offline.access`. Add credit to the developer account (pay-per-use) |
| `SOCIAL_TOKEN_ENCRYPTION_KEY` (optional) | Any long random string. Tokens are stored AES-256-GCM-encrypted. If unset, the key is derived from `SESSION_SECRET` (then rotating `SESSION_SECRET` means customers reconnect). |
| `SOCIAL_MOCK_PROVIDER=1` | Development and tests only — enables the built-in demo network. Ignored in production. |

`APP_URL` must be the public address (`https://mediaory.io`) because the redirect
URI is built from it. A platform whose variables are not set simply does not show a
Connect button.

### How it is built

- `social_connections` (per organization; sealed access/refresh tokens, status,
  cursor) and `social_connection_events` (a short excerpt + link; unique per post).
- OAuth: `GET /api/social/connect/<platform>` → platform consent (PKCE + random
  `state`, kept in a signed, HttpOnly, 10-minute cookie) → `GET /api/social/callback/<platform>`
  verifies state, person and organization, exchanges the code, seals the tokens.
- Worker job `sync_social_connections` (every 5 min; each platform has its own
  minimum interval): refreshes expiring tokens, fetches only what is new, stores
  events, notifies the person who connected the account (up to 8 individual
  notifications per poll, the rest as one summary). A grant the platform rejects
  marks the connection *Needs attention* and sends a "Reconnect" notification.
- First connection looks back 3 days at most, so it does not flood.
- Disconnecting deletes the tokens and every event collected from that account.

## 4. What is free? (checked 9 October 2026)

Question from the owner: *are there free ways to follow X, YouTube and other networks?* The honest answer is
"for YouTube, Reddit, Mastodon and Bluesky yes, within limits; for X no". Everything below comes from vendor
documentation and third-party guides read on that date — **nothing was tested live** (the build environment has no
outbound access to these hosts), and prices and limits change, so check the linked pages before relying on a number.

| Network | Free route | What it gives | Limits and catches | In Mediaory |
|---|---|---|---|---|
| YouTube | Channel / playlist RSS (`feeds/videos.xml?channel_id=…`) | New videos of named channels | Latest ~15; needs the `UC…` channel ID | **Built** (route 1) |
| YouTube | Data API v3 `search.list` with a free API key | Keyword search across all public videos | 10,000 quota units per day per Google project; one search costs 100 units → **about 100 searches a day**; quota cannot be bought, only extended by an audit form; `channels.list`/`videos.list` cost 1 unit | Not built; candidate (see below) |
| YouTube | Comments on a connected channel (OAuth) | Comments on the customer's own videos | 1 unit per poll | **Built** (route 3) |
| Reddit | RSS for a community, a user or a search (`search.rss?q=…`) | ~25 newest items per feed | Reddit often blocks cloud IPs (403/429); the official API's free tier is non-commercial only and commercial use needs an agreement; RSS use in a commercial product is a grey area | **Built** (route 1), best effort |
| Mastodon | Hashtag and account RSS; `/api/v1/timelines/tag/{tag}` without a token | Public posts of a tag or account | Whether a server allows tokenless timelines is its admin's choice (large ones restrict); search is weak without a token; small Turkish audience | **Built** (route 1: RSS) |
| Bluesky | Profile RSS (`bsky.app/profile/<handle>/rss`); `app.bsky.feed.searchPosts` | Posts of a profile; keyword search | Keyword search is free but, per third-party reports, **needs a signed-in session** (an app password) | Profile feeds **built**; search not built |
| Threads | `threads_keyword_search` | Public posts by keyword | Free API, but Meta **app review** is required; Meta's page (updated Jan 2026) gives 2,200 queries per 24 h per user; without approval you only search your own posts | Not built |
| X | **None for new developers** | — | Third-party guides report the free tier ended for new sign-ups on 6 Feb 2026; pay-per-use now (about US$0.005 per post read, own-account reads cheaper). X's own pricing page is the source of truth | Connected account (mentions of the customer's own account) **built**, pay-per-use on the customer's developer account |
| Instagram / Facebook | Hashtag search on a business account | Public posts under a hashtag | 30 unique hashtags per 7 days per account, app review needed; CrowdTangle closed in 2024 | Not built |
| LinkedIn, TikTok | — | — | No public brand-keyword API for companies; TikTok's Research API is for academic institutions | Not possible |
| Telegram | Public channels have a web preview (`t.me/s/<channel>`) | Posts of a public channel | No official keyword search; reading the preview page is scraping — treat as route 2 (your own bridge) | Not built |
| Hacker News | Algolia search API, no key | Tech / startup discussions by keyword | English-language, small Turkish relevance | Not built |

### What this means for the product

- **Already free and built:** YouTube channels, Reddit, Mastodon and Bluesky profile feeds (route 1). They need no
  keys and no customer set-up; an operator adds them in Admin → Sources → Social feeds.
- **Cheapest next step with real value — YouTube keyword search.** One free API key (`YOUTUBE_API_KEY`, Google
  Cloud, no billing) lets the worker run each distinct customer keyword once a day: 100 searches a day covers about
  100 distinct keywords across all customers. It would find videos that mention a brand without following the
  channel. Needs the key entered in Railway Variables (web and worker), a quota guard and a clear "searched once a
  day" note in the UI. Not built yet — say "başla" if you want it.
- **Not worth building now:** X keyword search (paid), Instagram/Facebook/LinkedIn/TikTok (no usable public API),
  Threads (review process for a small Turkish audience). If a customer needs them, a licensed data provider through
  the existing *Clipping / data provider (JSON API)* source is the honest route.

### Sources

- [X API pricing 2026 — Blotato](https://www.blotato.com/blog/twitter-api-pricing), [bundle.social](https://bundle.social/blog/x-api-pricing-2026-costs-limits), [SocialCrawl](https://www.socialcrawl.dev/blog/x-twitter-api-2026)
- [YouTube Data API — quota cost calculator (Google)](https://developers.google.com/youtube/v3/determine_quota_cost), [Phyllo — is the YouTube API free in 2026](https://www.getphyllo.com/post/is-the-youtube-api-free-in-2026-quota-limits-costs-when-to-pay)
- [Bluesky `searchPosts` (official docs)](https://docs.bsky.app/docs/api/app-bsky-feed-search-posts)
- [Mastodon.py — timelines](https://mastodonpy.readthedocs.io/en/latest/07_timelines.html), [Mastodon API rate limits](https://docs-p.joinmastodon.org/api/rate-limits/)
- [Reddit API pricing — Octolens](https://octolens.com/blog/reddit-api-pricing), [Reddit API key, limits, alternatives — SocialCrawl](https://www.socialcrawl.dev/blog/reddit-api-key-limits-alternatives-2026), [Reddit RSS — Feeder](https://feeder.co/knowledge-base/rss-feed-creation/reddit-rss)
- [Threads keyword search (Meta)](https://developers.facebook.com/documentation/threads/keyword-search)
