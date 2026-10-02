# Source coverage — what works today, what is possible, what it takes

Written for the owner. Plain answers to: *what does Mediaory actually watch, can it watch
"the whole internet", and how would social, video, podcast, TV and radio work?*
Vendor pricing and API terms change often and were not checked live — **verify before committing**.

## 1. What "30 outlets" means
Nothing limits Mediaory to 30 sources. "The same story from 30 outlets shows up once" was an
*example of de-duplication* (one story carried by many sites collapses into one mention with every
source attached). The marketing copy now says "dozens of outlets" so it cannot be read as a cap.
There is no per-plan source cap in the code (the only plan limit today is on monitoring queries).

## 2. What is actually collected today
Mediaory reads the **sources registered in the `sources` table**. Each source has a *connector*:

| Connector | What it does | Status |
|---|---|---|
| `rss` | Polls a feed URL | works |
| `sitemap` | Reads a site's sitemap.xml, fetches new pages | works |
| `web` | Fetches a single page (respects robots.txt, SSRF-safe) | works |
| `api` | Reads a JSON endpoint in our documented format | works |
| `mock`, `mock-social` | Fictional demo data | demo only |
| `social`, `youtube`, `podcast`, `broadcast` | — | **not built** (need a data provider) |

So today Mediaory is a **monitor over a list of sources**, not a crawler of the whole web, and
social / video / podcast / TV / radio are **not live** (the Social dashboard exists but has only
demo data behind it). The site copy now says so ("coming soon").
A fresh production database has no real sources until some are registered: **/admin/sources** has a
Türkiye catalog (~2,250 feeds: ~430 below plus ~1,800 from the verified list in scripts/data/ — regenerated with `pnpm exec tsx scripts/import-rss-list.ts <list>`, which skips any feed already listed; columnist feeds and forum feeds sit in their own groups so a bulk add can leave them out. The earlier ~430: a hand-checked list plus the community list at github.com/bakinazik/rss, regenerated with `pnpm exec tsx scripts/import-rss-catalog.ts <README>`; searchable, filterable by category, bulk "Test & add all shown"; each feed is fetch-tested when added, since feed URLs change) and a
custom RSS/sitemap form. Nothing is stored unless the feed was actually readable.
See also `CONTENT_POLICY.md` (licensing, takedown, snippet limits). Polling is polite: every real source (RSS, API, sitemap, web) every 2 hours (never the 30 s scheduler tick).

## 3. "The whole internet" — why it is not how anyone does it
No media-monitoring product crawls the entire web itself. Practical ways to get broad coverage:

1. **Curated source catalog (recommended first).** We maintain a list of RSS feeds / sitemaps:
   Turkish national + regional news, business, trade, major blogs, forums. Cheap, legal, fast,
   and high quality. Coverage = the size of the catalog (hundreds to a few thousand sites is realistic).
2. **News-search data providers for the long tail.** Keyword in → matching articles out, across many
   thousands of publishers (e.g. GDELT — free, global, includes Turkish; paid options such as
   Event Registry, NewsAPI-type services). Plugs in through our `api` connector. Cost per provider.
3. **Own web-scale crawler.** Enormous infrastructure, legal exposure, and still misses paywalled /
   JS-heavy / social content. Not recommended.

Recommended: **1 + 2**. Step 1 can start immediately and needs only a source list.

## 4. Social platforms
"Seeing Instagram / LinkedIn / Facebook" is limited by what the platforms allow, not by us:

| Platform | Official route | Reality |
|---|---|---|
| X (Twitter) | Paid API tiers | Keyword search of public posts is possible but paid; limits and prices change often |
| LinkedIn | Marketing / Community APIs | **No public post search.** Only pages you manage, with partner approval |
| Facebook | Graph API | Only pages/accounts that **connect to us**; no public keyword search (CrowdTangle was shut down in 2024) |
| Instagram | Graph API (Business) | Own connected accounts; hashtag search is heavily limited |
| TikTok | Research / commercial content APIs | Restricted access, approval required |
| YouTube | Data API v3 | Works, free quota (search is costly per call) — see §5 |
| Reddit | Official API | Works; commercial use needs an agreement |
| Bluesky / Mastodon | Open APIs | Works, free, but small audience in Turkey |

Two honest paths:
- **Official-API-first (our policy, brief §29):** connect a customer's *own* Facebook / Instagram /
  LinkedIn pages (they authorise us) + X and Reddit + YouTube + Bluesky. Shows *their* pages and
  public keyword mentions where allowed — not "all of Instagram".
- **Licensed social-data provider:** pay a provider that already holds the platform agreements and
  resells post data (Brandwatch/Talkwalker-class data feeds, or smaller data resellers). This is the
  only way to get broad cross-platform keyword search. Plugs into our `social` connector slot.
  Scraping the platforms ourselves breaks their terms and is not something we will build.

## 5. Video (YouTube and others)
- **Possible now-ish:** YouTube Data API — search videos by keyword, read titles, descriptions,
  channels, view/like counts and comments. Free daily quota, enough for a modest number of keywords.
- **What is *said* in a video:** captions are only downloadable through the API for videos you own.
  For others, transcripts need either a transcript provider or downloading audio and running
  speech-to-text — the latter is against YouTube's terms. So: title/description/comments = yes;
  spoken content of arbitrary videos = only via a licensed provider.

## 6. Podcasts, TV and radio
- **Podcasts — feasible.** Podcast feeds are open RSS. We read new episodes and run speech-to-text
  (a transcription service; priced per audio hour) so keywords inside episodes can match.
- **TV and radio — needs a broadcast-monitoring partner.** Recording channels, licensing and
  transcription is a business of its own. The realistic route is integrating a provider's feed
  (a Turkish media-monitoring agency or an international one) through the `broadcast` slot.
  We would not record broadcasts ourselves.

## 7. Suggested order
1. ~~Ship the **source catalog** and a way for admins to register sources~~ — **done** (/admin/sources).
   Next: grow the catalog (regional press, trade, business) and add sitemap coverage.
2. Add **one news-search provider** for long-tail keyword coverage (evaluate GDELT first — free).
3. **YouTube** (official API) and **podcasts** (RSS + transcription).
4. **Connected social pages** (Facebook / Instagram / LinkedIn) + X + Reddit via official APIs.
5. **Broadcast (TV/radio)** and broad social search only through a licensed provider partnership.

## 8. Decisions needed from the owner
- Which regions/languages first (Turkey-only, or global)?
- Budget for data providers (news-search, social, broadcast) — each is a recurring cost that feeds
  the per-keyword pricing (`BILLING_DECISION.md`).
- Are broad social + TV/radio coverage *launch* requirements, or acceptable as later, partner-backed
  add-ons? (They are the expensive, partner-dependent parts.)
