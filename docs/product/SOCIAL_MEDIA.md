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
