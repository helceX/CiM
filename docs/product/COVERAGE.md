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

## 2b. How a story becomes a mention (and why a new monitoring is not empty)

- **Crawl cost per source:** one download of the feed (the health check's copy is reused by the fetch) and one robots.txt per host per hour (shared by all of its feeds). Looking for the same story in another source uses the `articles_fetched_at_idx` index and only takes the global clustering lock when a look-alike exists.
- **Where it runs:** the crawler lives on the server (the worker service), every 2 hours per source, around the clock. It does not depend on anyone's computer or on the app being open. The Monitoring page shows what it has actually done (sources scanned, last scan, stories in 24 h).
- **What is matched:** the headline **plus the feed's own summary** (`matchableText`). Headline-only matching missed every story that names a brand only in its first lines. The 200-character stored snippet is unchanged (content policy); the longer summary is read at ingest and not kept.
- **New monitoring:** when one is saved (or created in onboarding) the stories already stored for the last 30 days — the same window the preview uses — are matched at once (`backfillMentionsForQuery`), so the preview count and the first result agree. Those mentions are dated to the story, not to the save, so alert checks do not see a burst.
- **Word fingerprint:** since migration 0040 every new story also keeps a *word fingerprint* (`articles.word_fingerprint`, about 300–600 bytes): 32-bit hashes of the distinct words of the headline plus the feed's whole summary, 16-bit hashes of neighbouring word pairs (so a phrase is not confused with two words that appear apart) and hashes of short ALL-CAPS abbreviations as written. It is not text and cannot rebuild a sentence, so the 200-character storage limit holds. A monitoring saved later (and the preview) matches a stored story when its headline + excerpt match exactly **or** its fingerprint contains the keyword. Limits: only whole words and phrases (letters, digits, spaces); `banka*` and keywords with punctuation (`#etiket`, `e-ticaret`) still match on the stored text only; a monitoring with an exclusion the fingerprint cannot judge never matches through it; stories stored before 0040 have no fingerprint. Fingerprints are deleted with their story (14-day pruning for unmatched stories).
- **Titles** are entity-decoded at ingest (`TÜİK&apos;in` → `TÜİK'in`); migration 0037 repaired the rows stored before that.

## 2c. The world catalog

`scripts/data/DÜNYA RSS PAKETİ/` is the operator's research pack (7,729 records, 5 Oct 2026). `scripts/import-world-pack.ts` turns it into `packages/core/src/world-catalog.generated.ts`: 4,657 candidate feeds after leaving out plain-http feeds (811), Reddit (RSS ends 13 Nov 2026), licence-required agencies and everything the Türkiye catalog already has (2,169 repeats). Admin → Sources → World catalog browses it by place (map + World → continent → country table), topic, text and "XML-checked only"; the list is filtered on the server (`/api/admin/catalog`), never shipped whole. A country is the pack's directory label or community focus, not where a publisher is registered; 1,018 feeds have no confirmed country and sit under "Global". Every feed is still fetch-tested before it is stored. Continent codes are three letters (EUR, ASI, AFR, NAM, SAM, OCE) so they cannot be confused with ISO country codes (AF, NA, SA).

## 2d. Disk, pruning and the automatic import

On 6 Oct 2026 the Postgres volume filled up ("No space left on device") and the worker could not even run its start-up migration. Nothing deleted stored stories, and a few thousand sources each add dozens of stories per crawl. Since then:

- **Pruning:** every 6 hours (at :30, 03:30 UTC and so on) `prune_articles` deletes stored stories that no customer's monitoring matched once they are older than 14 days (`ARTICLE_CACHE_DAYS`; a new monitoring can only be matched against what is still stored, so this is also its history window). Stories with mentions stay until the customers' own retention removes the mentions. If `DB_VOLUME_MB` is set and the database passes 70% of it the window shrinks to 7 days (85%: 3 days) by itself. It goes by the size of the database files, and Postgres only hands freed space back to the disk after a `VACUUM FULL`, so after a spike the shorter window stays until that has been run.
- **Free space now:** Admin → Overview → Storage → "Free space now" deletes stored stories older than N days (0 = all). It counts first. By default only stories no monitoring matched (a cache); the second option also deletes matched stories and their mentions and needs DELETE typed. The worker also prunes once at every start-up, and `ARTICLE_CACHE_DAYS` (worker env, 1–365) changes the 14-day default. Freed space is reused by Postgres at once; the file itself only shrinks after a VACUUM FULL.
- **Storage panel:** Admin → Overview → Storage shows the database size and the biggest tables; set `DB_VOLUME_MB` (the Postgres volume size in MB) on the web and worker services to also see the share used.
- **Automatic catalog import:** the worker adds the Türkiye and world catalog feeds (50 every 5 minutes, each fetch-tested; Türkiye news first, then XML-checked world feeds, then the rest). It stands down — and says why on Admin → Sources — when it is paused, when `DB_VOLUME_MB` is not set, when the database is over 60% of the volume, when more than 4,000 crawl jobs are waiting, or more than 400 are waiting and the oldest has waited over 90 minutes, or at 9,000 sources. Unreadable feeds are retried once, three days later. The crawler fetches 15 feeds at once (`CRAWL_CONCURRENCY`, worker env, 1–40).

## 2e. The weekly archive

Every Monday-to-Sunday week (Türkiye time) the worker builds, per organization, a self-contained HTML page (day → monitoring → kind, headlines, 200-character excerpts, links to the publishers; no scripts) and an XLSX, stores both in a **private Cloudflare R2 bucket** and emails owners/admins a link to `/archive`. Files open through a 5-minute signed redirect after an organization + `reports:read` check. The job runs daily at 04:00 UTC and is idempotent (one `archive_runs` row per org and week); admins can trigger it from `/archive` ("Build last week now").

Variables (web **and** worker): `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`. Without them the job does nothing and the page says so.

Optional, worker only: `ARCHIVE_DELETE_AFTER_DAYS` (28–3650). Once an archived week ended that many days ago, and its files are re-verified in R2, its mentions are deleted from Postgres. Unset = nothing is ever deleted because of the archive.

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
