# Content & publisher policy (how Mediaory treats other people's content)

Status: implemented. **Not legal advice** — the public texts (`/terms`, `/bot`, `/takedown`) and this policy
must be reviewed by a lawyer experienced in media monitoring / data processing before launch.
Note: "fair use" is a US doctrine; Turkish law works with FSEK's own exceptions (alıntı, etc.), so don't rely on
that phrase in contracts or marketing.

## Rules the product enforces
| Rule | Where |
|---|---|
| Only public RSS feeds / sitemaps; pages only if `robots.txt` allows | `packages/ingestion` (RSS, Sitemap, Web connectors) |
| Never full text: title + link + time + excerpt ≤ 200 chars at a sentence/word boundary | `normalize.ts` `makeSnippet` |
| Every result links back to the publisher's page | mention drawer, reports |
| Polite polling: every real source once per 2 hours | `packages/core/src/crawl-interval.ts` |
| Honest identity: `Mediaory-Bot/1.0 (+https://mediaory.io/bot)`; page explains it | `safe-fetch.ts`, `/bot` |
| News agencies (AA, DHA, İHA, Reuters, AP, AFP, Bloomberg) refused unless the admin confirms a written licence | `restricted-publishers.ts`, `/admin/sources` |
| A `robots.txt` rule that names `Mediaory-Bot` stops feed fetching too | `robots.ts` `isExplicitlyBlockedByRobots` |
| Public takedown form → admins e-mailed → `/admin/takedowns` | `/takedown`, `api/takedown` |
| Block a publisher: pauses its sources, can't be re-added/resumed, optional purge of stored articles (cascades to mentions) | `blockDomain` |
| Terms of Service with the "indexing engine / rights belong to publishers / no responsibility for accuracy" language | `/terms` |

## Still on the owner
- Lawyer review of Terms, a **Privacy / KVKK aydınlatma** text (not written yet — news content contains personal data), and this policy.
- Written licences before adding any agency; check each publisher's terms of use before adding it (catalog URLs are candidates, not permissions).
- Decide the takedown response promise (the pages say "we aim to answer within two business days").
- Fill `terms_url` per source if you want to track each publisher's terms in the DB.

## The community RSS list (bakinazik/rss)
- ~430 Turkish feeds are bundled as catalog candidates (`packages/core/src/source-catalog.generated.ts`). Only outlet name, feed URL and category were copied — never the list's text.
- That repository has **no licence file**. Feed URLs are facts about other people's public sites, but a curated list can carry compilation rights, so: credit it (done in the generated file and the admin page), and consider opening an issue asking the author to add a licence or permission.
- A listed feed is **not a permission** to use it commercially. AA and other licence-required agencies are filtered out automatically; for every other publisher the terms-of-use check is still yours (see "Still on the owner").
- Several feeds share one host (e.g. 29 Sözcü, 20 Euronews category feeds): each is polled on its own 2-hour schedule, so a host with N feeds receives ~N×2 requests per 2 hours. If a publisher objects, block the domain (`/admin/takedowns`).
