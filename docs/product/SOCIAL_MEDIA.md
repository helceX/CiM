# Social feeds: free-first implementation and access review

Reviewed 10 October 2026. A feed being reachable and an open-source scraper existing are not permission to collect a platform's content commercially. Mediaory uses published public RSS/Atom through its existing guarded ingestion pipeline. No paid provider, proxy, headless browser, new Railway service or login-cookie storage is introduced by this work.

## Available in Admin → Sources → Social feeds

| Platform        | Scope                                               | Limits                                                                                                                                                                 |
| --------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| YouTube         | Channel ID / playlist RSS                           | Recent videos only, not all comments, transcripts, historical or global keyword search. No API key needed for these feeds.                                             |
| Mastodon        | Public account / hashtag RSS on a specified server  | Only what that server publishes; not all fediverse posts. Server rules apply.                                                                                          |
| Bluesky         | Public profile RSS                                  | Profile posts only; no whole-network keyword search or private data.                                                                                                   |
| GitHub          | Public repository releases Atom                     | Added in this change. Release announcements, not private code or repository-wide discussion.                                                                           |
| Discourse       | Public tag RSS on a specified forum                 | Added in this change. No private categories, login or arbitrary search feed.                                                                                           |
| Reddit          | Existing community/user/search URL builder retained | Do not activate for Mediaory without confirmed access. Reddit requires permission and a contract for commercial use; RSS reachability does not establish an exemption. |
| Operator bridge | Existing custom route input retained                | Only authorised published feeds. Mediaory does not host RSSHub/RSS-Bridge or supply credentials. A bridge has its own hosting costs and platform obligations.          |

Instagram, X/Twitter, LinkedIn and Facebook are shown as unavailable in the free public-feed selector, with specific explanations. Their adapter routes are not invented or silently routed to a third-party scraper. Existing separately configured connected-account functionality remains separate from this feed work.

## Requested networks that cannot be promised as free public monitoring

- **X/Twitter:** official reads use pay-per-use credits. Excluded from the free feed path; no purchase or credit setup made.
- **Instagram/Facebook:** official Meta APIs require appropriate accounts, grants and often app review. They do not provide unrestricted public brand-keyword RSS. A future integration would collect only data permitted by the account and app permissions.
- **LinkedIn:** its permissions and partner programmes require authorisation; most need explicit approval. The open permissions are not a public listening API.
- **Reddit:** commercial access needs permission and a contract. No new Reddit sources were activated as part of this work.

## Open-source projects evaluated

- [RSS-Bridge](https://github.com/RSS-Bridge/rss-bridge), Unlicense/public domain. Its [YouTube bridge](https://github.com/RSS-Bridge/rss-bridge/blob/master/bridges/YoutubeBridge.php) uses the same platform-published videos.xml endpoints, but also includes scraping paths. We retain the native feed path; no PHP service or bridge code is installed.
- [RSSHub](https://github.com/DIYgod/RSSHub), currently AGPL-3.0. Broad route catalogue, but running it would add hosting work and many social routes require platform credentials or scraping. Not deployed or copied into Mediaory. This review does not rely on older claims that it is MIT licensed.
- [Mastodon](https://github.com/mastodon/mastodon), a platform that deliberately publishes public profile/tag feeds. No instance is hosted by Mediaory.
- [Discourse](https://github.com/discourse/discourse), a platform with native public tag feeds. No forum is hosted by Mediaory.

The implementation adds small URL builders to the existing connector rather than installing an aggregator. No new dependency or executable downloaded from these repositories is run.

## Cost and safety boundaries

1. Adding options does not start polling. An administrator must choose and add each relevant source; there is no bulk social catalogue import.
2. The existing source-add endpoint fetch-tests and parses the feed before saving it, deduplicates its URL and keeps titles/excerpts only.
3. The existing safeFetch guards DNS/IP destinations, redirects, protocol, response size and timeouts. Generic input is not an escape hatch around private-network protection.
4. Sources share the existing queue. Production crawl concurrency is capped at 3; the normal source schedule is not shortened. No additional workers or browser processes are started.
5. No social login passwords/cookies, proxy subscription, paid API key or account grant is requested by this change. Public bridge servers are not selected as a hidden dependency.
6. RSS has no licence fee here, but CPU, RAM and storage still contribute to the existing Railway bill. Start with a small relevant set, compare throughput/resource use, and pause noisy feeds. Zero incremental resource consumption cannot be guaranteed.
7. No new sources are activated merely to inflate source count. Profile/repository/tag choices must reflect the customer's monitoring needs.

## Primary references

- [Reddit commercial access](https://support.reddithelp.com/hc/en-us/articles/14945211791892-Developer-Platform-Accessing-Reddit-Data)
- [X official pricing](https://docs.x.com/x-api/getting-started/pricing)
- [Meta's official Instagram API collection](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api)
- [LinkedIn API access](https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access)
- [Mastodon syndication feeds](https://docs.joinmastodon.org/user/network/#syndication-feeds)
- [Discourse native feeds](https://meta.discourse.org/t/finding-discourse-rss-feeds/264134)
- [GitHub public release feed example](https://github.com/RSS-Bridge/rss-bridge/releases.atom)

Use these access conditions as the source of truth; do not treat a bridge's platform list as a commercial-access guarantee.
