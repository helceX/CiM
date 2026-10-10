# Google signals — assessment of the "Trend Alert Brief"

Status: **geo-only Google Trends RSS adapter implemented, disabled by default** (9 Oct 2026). Google News search and Google Alerts remain assessment-only.

The adapter requires both `CIM_EXTERNAL_COVERAGE_ENABLED=true` and `CIM_GOOGLE_TRENDS_RSS_ENABLED=true`, and limits source URLs to geographies in `CIM_GOOGLE_TRENDS_GEOS` (default `TR`). It stores trend labels and synthetic daily identity only; approximate search-volume buckets from the feed body are discarded. It does not transmit tenant monitoring terms. No production source is seeded and the flags remain false in `.env.example`; rollout still needs an operator decision.

The owner supplied a brief (`CiM_Trend_Alert_Brief_Claude_Code.md`) for a self-service "Signals" area with two
Google-derived sources — **Trends "Trending now"** and **Google News search** — plus an optional **Google Alerts**
import. This page maps it onto what Mediaory already does, says what is really new, what is risky, and proposes
an order. Code references are to this repository as of today.

## Verdict

- **Feasible, and mostly with parts we already have.** The brief's "Signals panel" is, piece by piece, the
  existing Monitoring (tracker), Mentions (matches inbox), Alerts (delivery), Analytics and Reports (overview and
  export). The brief itself says "do not build a parallel system" — so do **not** add a separate Signals area; add
  *coverage providers* to Monitoring instead.
- **What is really new is not the panel**, it is: (1) a Trends provider shared by country, (2) tenant-owned query
  feeds for Google News search (a new concept — sources are global today), (3) feed health with error classes,
  (4) consent, quotas and a provider circuit breaker, (5) wording that never says "was searched".
- **The crux is external.** Both Google endpoints are unofficial: no published terms for automated commercial use,
  no SLA. The Trends feed is thin; the News RSS rate-limits aggressively and wraps its links. So: verify from
  production first, ship Trends first (cheap, private), and treat News search as an optional, opt-in feature with a
  kill switch — never as a core promise.

## Brief versus Mediaory today

| Brief asks for | Mediaory today | Gap | Size |
|---|---|---|---|
| Tracker: name, terms, phrases, exclusions, region, language | Monitoring: `QueryAst` (include, exact phrases, exclude), `regionScopes`, `sourceTypes`, intent, brand groups | **AND** across terms (include is any-of today) | S |
| Matches inbox: read/unread, save, archive, "not relevant", search/filter, why matched | Mentions: status new/reviewed/archived, feedback relevant/irrelevant/duplicate, assign, tags, comments, `matchType` + `matchedRule`, signal reasons, filter bar | "Saved" (a tag or a status), a *signal type* filter | S |
| Turkish matching: I/ı İ/i, word boundary, phrase, suffixes | `turkishFold`, morphology, `keywordMatches` (whole word, phrase, `*` prefix, case-sensitive abbreviations) — tested | none | – |
| Same item never matches twice | `articles` unique on canonical URL and content hash; `mentions` unique on (query, article); alert cooldown | New providers must give a stable canonical URL (Trends: one per query per day) | S |
| Notifications | Alert rules (keyword, high relevance, spike, sentiment shift, emerging topic, creator spike, competitor) over in-app / e-mail / webhook; e-mail outbox retried 5× | Per-user preferences, quiet hours, a per-delivery status view | M, optional |
| Overview, analytics, CSV export | Analytics, report builder (CSV, XLSX, PDF, HTML), visuals | A *signal type* breakdown | S |
| Feed health | `sources.status` healthy/delayed/error/blocked/unavailable + `lastCheckedAt` (global sources only) | Error classes (403, 404, 429, 5xx, timeout, malformed, empty), message, last success, next attempt, failure count | M |
| Polling | Scheduler tick 30 s; interval per connector (RSS 2 h); one job id per source; 3 attempts, exponential back-off | Trends cadence (~10–15 min), jitter, `Retry-After`, provider-level circuit breaker, fairness | M |
| SSRF and XML safety | `safeFetch`: protocol check, resolve-then-connect with every address checked, redirects re-validated, 5 MB cap; `fast-xml-parser`; plain text only is stored | Host allowlist for user-initiated feeds | S |
| Secret feed URLs | AES-256-GCM `encryptSecret` (social tokens) | Log/telemetry redaction of query URLs, masked display | S |
| Quotas | Only Free = 1 monitoring; billing is a label until iyzico is live | Per-plan feed quota and a usage counter (needs the owner's numbers) | S–M |
| Tenant isolation, retention, deletion | Org-scoped repositories, isolation tests, retention settings, KVKK purge (org FKs cascade) | The new table must be added to the same tests | S |
| **Auto-created RSS source from a tracker** | — | Tenant-owned feed table + provider adapter | **L** |
| **Trends provider** | — | Global per-country source + a parser for the `ht:` fields | **M** |
| **Google News search provider** | — | URL builder and canonicalizer, preview, consent, first-fetch baseline | **L** |
| **Google Alerts import** | — | Allowlist `www.google.com/alerts/feeds/`, encrypted URL, masked | S–M (after the feed table) |

Acceptance criteria of the brief: **met today** — 4 (persistent, filterable inbox), 5 (repeat polls do not
duplicate), 7 (tenant-isolation pattern), most of 10 (Turkish matching, XSS, SSRF, deletion); **new work** — 1, 2, 3,
6, 8, 9, and secret redaction from 10.

## Proposed design

1. **No "Signals" menu item.** "Signal" already means *importance* in Mediaory (signal score, "why am I seeing
   this?"); a second meaning would confuse people. The choice lives inside the monitoring form as **Coverage**
   (Mediaory catalogue / Google Trends / Google News search), and each mention shows where it came from
   ("Observed among rising searches in Google Trends (TR)" / "Found through Google News search").
2. **Trends = a global source per country**, `type = "trends"`, its own category so it never lands in news
   counts; a monitoring receives it only if it selected that category (the existing `sourceTypes` filter does this
   already). Matching happens locally — the keyword never leaves Mediaory, so no consent is needed. The canonical
   URL is synthesized per query per day (the feed's own item link is generic and would collapse all items into one
   article under the unique index).
3. **Google News search = a tenant-owned feed.** New table `monitoring_feeds`: organization, monitoring query,
   provider, canonical parameters, URL hash (unique per org + query), state `pending | validating | active |
   degraded | disabled`, last success, last error class + message, next attempt, consecutive failures, consent time
   and user. `ON DELETE CASCADE` from the monitoring gives deletion and retention for free. Articles it fetches
   attach to one generic provider source ("Google News · TR"), so no keyword appears in any global list, and
   mentions are created **only for the owning monitoring** (the catalogue path matches every tenant).
4. **First fetch is a baseline.** A new feed returns up to ~100 recent items; they are stored but older ones are
   ignored and no alert is sent for them — otherwise a new feed floods the inbox and the mailbox.
5. **Provider circuit breaker.** Sustained 429/403 pauses *all* feeds of that provider (honouring `Retry-After`)
   instead of every feed hammering an endpoint that is already blocking us.
6. **Honest wording.** Trends: "observed among rising searches". Never "searched", never a volume or percentage
   chart — the feed has no such data. News search: "found in news indexed by Google News", not "the web".
7. **Consent and KVKK for News search.** The search terms go to Google (a US company): explicit opt-in text before
   saving, a consent record on the feed, a conditional sub-processor entry, a sentence in the privacy notice, and
   the cross-border item already open in `docs/product/KVKK.md`. A sensitive term can use Trends (local matching)
   or publisher feeds instead.
8. **Quotas and kill switch.** Constants per plan until billing exists (suggested start: Free 0, Starter 3, Pro 10 —
   the owner decides), a global cap, and an environment switch that turns the provider off.
9. **Display detail.** Google News links are wrapper redirects (`news.google.com/rss/articles/…`). Resolving them to
   the publisher needs an undocumented endpoint, which we do not use; we link the wrapper (it redirects in a
   browser). An aggregator also must not count as an "outlet" when a story's reach is scored (`countClusterOutlets`).

## External facts, and what is unverified

- **Trends RSS** (third-party observation, not an official spec): RSS with an `ht:` namespace; `ht:approx_traffic`
  ("200+", a floor, not a measurement), `ht:news_item` (title, URL, source), a picture; about **10 queries per
  country**; an unrecognised country code returns an *empty 200*, so geo codes must be validated before the feed is
  called "healthy". Google's help page (cited by the brief) says Trending Now refreshes about every 10 minutes.
- **Google News RSS search**: unofficial; no published terms for automated or commercial use found; rate limits are
  undocumented and reported as aggressive (HTTP 429); about 100 results per query; links are wrappers (above).
- **Plan B for query-based news — GDELT DOC 2.0 API**: free, no key, quoted terms allow unrestricted use including
  commercial with a citation, rolling ~3-month window, language/country operators, unofficial rate limit around one
  request per 5 s and reported as flaky. Not checked against their terms page. It would sit behind the same adapter.
- **The build sandbox cannot reach Google** (the egress proxy answers 403), so none of this could be tested live.
  First step is a production check: *Admin → Sources → Custom feed → **Test*** (do not add) for
  `https://trends.google.com/trending/rss?geo=TR` and
  `https://news.google.com/rss/search?q=Mediaory&hl=tr&gl=TR&ceid=TR:tr`.

Sources: [Apify — Google Trending Searches](https://apify.com/dr_ben/google-trending-searches) ·
[GNews library — exceptions (429 handling)](https://gnews.readthedocs.io/en/latest/reference/exceptions.html) ·
[google_news_decoder — wrapped links](https://hexdocs.pm/google_news_decoder/llms.txt) ·
[GDELT DOC 2.0 API](https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/). Google's own pages are cited in the brief
(Trends help, Alerts help, Trends API alpha); the Trends API, if it opens, would be a separate adapter and is where
real interest-over-time data would come from.

## Order of work

0. **Owner, 5 minutes — the production check above.** Tells us whether Google serves Railway's addresses, what the
   XML really looks like and how many items it has. Decides whether phase 2 happens at all.
1. **Trends provider — 1 PR (M).** Global source per country, `ht:` parser, 10–15 minute cadence, synthesized
   canonical URL, coverage category, "trend" match type and wording, English + Turkish. Works with the existing
   keyword alert; no consent, no quota.
2. **Feed foundation and Google News search — 2 PRs (L).** (a) table, adapter with allowlist, health classes,
   scheduler with jitter/`Retry-After`/circuit breaker, owner-only matching, baseline, quotas, tenant-isolation
   tests; (b) UI: coverage section, consent, preview, health panel, source badge and filter, analytics breakdown.
3. **Extras (each small):** Google Alerts import, AND mode, quiet hours and per-user alert preferences.

## Decisions for the owner

1. Is an unofficial Google endpoint acceptable as an **optional, opt-in** feature with a kill switch? (Recommended:
   yes, not as a selling point.)
2. Plan quotas for external feeds (suggested above).
3. Start phase 1 now, or wait for the production check?
