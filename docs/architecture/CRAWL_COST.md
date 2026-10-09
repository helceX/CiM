# Crawl, clustering and alert cost — what was measured, what changed, how to check it on Railway

Status: living document, started 9 Oct 2026 after the first Railway invoice looked wrong. Every number marked
"bench" comes from the benchmark in `apps/worker/bench/` (below), not from production; every claim about
production is marked as an estimate until the Railway measurements in "Checking it on Railway" confirm it.

## Why this exists

Railway usage for the period (reported by the owner): Postgres 18.30 $ (of which CPU 16.10 $), Worker 1.76 $,
Web 0.92 $, Redis 0.33 $. So the bill is **Postgres CPU** — about 1.6 vCPU busy on average over the period, with
bursts to 8–10 vCPU — not the worker. The worker log showed `crawl_source` jobs completing back to back, and
Postgres showed five sessions waiting on `pg_advisory_xact_lock(hashtext('story-cluster-assign'))`.

## How it was measured

`apps/worker/bench/` runs the real worker code (crawl job, scheduler tick, alert evaluators) against a scratch
Postgres/Redis with fake publishers instead of the internet, and reports Node CPU, Postgres CPU
(`/proc` of the postgres processes), statements, rows, event-loop busy share and peak RSS; statement-level
numbers come from `pg_stat_statements` snapshots taken before and after (no privileges needed).

```
createdb cim_bench && DATABASE_URL=postgres://…/cim_bench pnpm db:migrate     # the name must contain "bench"
pnpm --filter @cim/worker bench:seed-articles -- --articles=588000 --recent=40000   # production-sized articles table
pnpm --filter @cim/worker bench:crawl -- --scenario=crawl --keep-articles=true --sources=20 --items=20 \
    --monitorings=40 --cycles=2 --id-base=80000 --top=6          # first visit of 20 new publishers, then a re-visit
pnpm --filter @cim/worker bench:crawl -- --scenario=scheduler --keep-articles=true --scheduler-sources=9000
pnpm --filter @cim/worker bench:crawl -- --scenario=alerts --keep-articles=true --monitorings=200
```

The scratch table has 588 000 stories (the size reported from production), 40 000 of them in the last 48 hours,
titles built from real Turkish words plus rare tokens standing for proper nouns, 1 story in 10 a look-alike of
another outlet's. Caveats: one machine (4 vCPU, Postgres with default settings), synthetic titles, 40 monitorings
in the crawl scenario. Absolute numbers will differ from Railway; the ratios and the query plans are what carry over.

## Findings

### F1 — story clustering searched 48 hours of stories for every new story (the Postgres CPU)

`findSimilarRecentArticle` (`packages/db/src/repositories/articles.ts`), called from `maybeAssignStoryCluster`
(`packages/ingestion/src/pipeline.ts`) once for every story the crawler stores for the first time, ran
`similarity(title, $1) > 0.5` over every story fetched in the last 48 hours. Plan: bitmap scan of
`articles_fetched_at_idx` (≈ 40 000 rows here), then `similarity()` row by row — about 0.6 s of CPU per story with
the window at 40 000 rows, growing linearly with it. The trigram index `articles_title_trgm_idx` is not used (the
query is written with the function, not the `%` operator).

bench, 20 new publishers × 20 stories = 400 new stories, 588k-row table, 15 concurrent jobs:

| | before | after |
|---|---|---|
| similarity statement, 400 calls | **545 675 ms** (1.36 s each) | 11 900 ms (30 ms each) |
| Postgres CPU of the cycle | 171 s | 8.1 s |
| wall time of the cycle | 79.7 s | 3.5 s |

With the production setting `ARTICLE_CACHE_DAYS = 14`, 588 000 rows means roughly 42 000 new stories a day and a
48-hour window of about 80 000 rows — so each lookup is probably ~1.2 s there, and 42 000 of them a day is of the
order of 0.5 vCPU on average with 15 of them running at once in a burst (a newly imported source's first crawl
stores 20–40 stories at once). That is an estimate: confirm with Query Statistics (`calls × mean_exec_time`).

### F2 — the `story-cluster-assign` lock was held around a second full search

`maybeAssignStoryCluster` took one global transaction-level advisory lock and, inside it, repeated the whole
search — so the lock was held for as long as the search (0.6 s up to seconds under load), every cluster started
anywhere waited behind it, and each waiter held one of the pool's connections (`pg.Pool` default of 10, no setting).
It is used nowhere else (`grep story-cluster-assign`). One worker process, `crawl_source` concurrency 15: the same
breaking story shows up in many feeds within minutes, so many jobs reach it together. The lock is not wrong in
purpose — it stops two stories that found each other from inventing two cluster ids — only too wide and too long.

### F3 — `turkishFold` was most of the worker's CPU

`packages/core/src/turkish.ts` called `toLocaleLowerCase("tr-TR")` for every character (an ICU locale lookup each
time), and `matchesText` folded the same story again for every monitoring. bench profile of a crawl with 40
monitorings: **78 % of the process's CPU** in `turkishFold`. Cheap to fix, and the worker is only 1.76 $, but it
also runs inside `insertArticle` for every new story.

### F4 — `coverage` counted a day of stories with a full table scan

`getCrawlCoverage` (the Monitoring page) counted `articles.created_at >= now() - 24h`; `created_at` has no index —
a parallel sequential scan of the table, 96 ms (with parallel workers) on 590k rows, at every page view. Same
instant as the indexed `fetched_at` (equal in all 590 442 bench rows; both default to `now()` and nothing updates
them): 5.9 ms, an index-only scan.

### F5 — what a re-visit of an unchanged feed costs (open — next change)

For each story of a feed that is already stored, every crawl still runs `findExistingArticle` (`select *`, with the
tsvector and bytea columns), the matching loop against every monitoring, and `createMentionIfNotExists` for each
match (an `INSERT … ON CONFLICT DO NOTHING`). It parses the feed twice (the health check, then `fetch`). Every
source is fetched every two hours with no `ETag`/`Last-Modified`, and a failing job is attempted three times.
bench: small in Postgres terms (20 ms per source), but it is where the worker's CPU and the pool's round trips go.

### F6 — the scheduler tick and the alert pollers (open — next change)

- Every 30 s `listActiveSources` reads all source rows (9 000 in bench): 149 ms of Node CPU and 17 ms of Postgres
  per tick, 2 880 ticks a day.
- Every 60 s five evaluators read every rule and run an aggregate per rule. bench, 837 rules over 588k mentions:
  **5.3 s of Postgres CPU per minute** (spike 2.7 s, sentiment shift 1.4 s, competitor 0.5 s, creator 0.55 s,
  topic 0.2 s) ≈ 0.09 vCPU continuously; it grows with rules × mentions per monitoring. `getQuerySpikeStats`
  joins 24 hourly buckets to `mentions` on `date_trunc('hour', created_at)`, which cannot use an index, and there
  is no `(query_id, created_at)` index. The cooldown is checked only after the statistics were computed.

### F7 — indexes (verified in the plans, nothing dropped)

`articles` holds 342 MB of indexes on 588k rows. `articles_title_trgm_idx` (GIN, `gin_trgm_ops` on `title`) is not
used by either query that touches titles: the clustering query above, and `PostgresSearchIndex.search` which
compares `word_similarity(unaccent(lower(…)), unaccent(lower(title)))` — an expression the raw-`title` index cannot
serve. It is maintained on every insert and is the biggest "unused" candidate. **It is not dropped by code**: the
decision needs production `idx_scan` figures — run `docs/deployment/postgres-diagnostics.sql` first (section 3).
A trigram-index version of the clustering lookup was tried and rejected: 95–290 ms against 8 ms for the full-text
narrowing.

### F8 — `pg_stat_statements does not exist`

The Postgres log line means Railway's Query Statistics page queries a view that was never created in this
database. See "Enabling Query Statistics" below.

### F9 — the catalog import: `failed 25`, `failed 9`, and the repeats behind them

`apps/worker/src/jobs/import-catalog.ts` adds catalog feeds 50 at a time every 5 minutes, each fetch-tested first. Its
log line said `added 0, failed 25, skipped 0` and nothing else. Reading the job and the table it writes:

1. **The reason was stored but never shown.** `catalog_import_attempts.error` held the message, the admin page showed
   only a count, so "failed 25" could mean 25 dead feeds or one timeout storm.
2. **An exception was logged and not recorded.** The `catch` branch counted a failure but wrote no attempt row, so the
   same feed was picked again at the next run — five minutes later, every five minutes, forever. That is the only
   unbounded repeat in the job (and is a cost: a fetch plus a parse each time).
3. **Candidates came in catalog order**, and the catalog has publishers with up to 265 category feeds in a row, so a
   batch was often one publisher asked for 20–50 feeds at concurrency 6.
4. **Every failure was retried once after three days**, whatever its cause, and a timeout (8 s, hit when the worker's
   event loop is busy crawling) was treated as "the feed is dead".
5. A finished import still scanned the whole catalog (about 25 chunks of two queries) and read every source row to count
   them (`listActiveSources(...).length`) every 5 minutes.

What changed: failures are classified (`packages/core/src/feed-failure.ts`); dead feeds (404/410, not a feed, empty,
refused, policy) are tried twice, three days apart, failures of the moment (timeout, network, 429, 5xx) after a day and
up to five times; at most two feeds per publisher per batch and never two at once; a batch of ≥ 10 failures over ≥ 5
publishers that are ≥ 80 % transient and added nothing is treated as *our* fault — those failures are **not** recorded
against the feeds, the run says so in its note and the import waits 30 minutes; exceptions are recorded with their
reason; a finished import looks again after an hour (resuming from `/admin/sources` clears the hold); sources are
counted with `count(*)`. `/admin/sources` shows the failure breakdown, the job logs it
(`failures: timeout 22, network 3 over 17 sites`). No failure is shown as a success: `failed` still counts every one.

Safe re-run: nothing needs cleaning up. Feeds recorded `failed` before this change are classified from their stored
message the next time the import looks at them (a stored timeout becomes eligible after one day instead of three).
To look again at everything now, press "Pause import" then "Resume import" on `/admin/sources`.

**Expected effect:** fewer fetches and parses per hour once the catalog is done or backing off, no repeat of the
exception path, and failures that say what they are. It is *not* expected to move the Postgres CPU figure on its own;
the first crawls of newly imported feeds were (clustering, F1), which are now cheap. Verify with the import log
line and the `catalog_import_attempts` breakdown on the admin page; on Railway compare the worker's outbound request
count (not exposed by Railway — use the log line `[import-catalog] added …`) before and after.

## What changed (this change)

| Change | Where | Verified by |
|---|---|---|
| Clustering lookup narrowed by the full-text index to stories sharing one of the six longest headline words (newest 500 compared exactly, same 0.5 rule); stories published more than 48 h ago are not looked up | `articles.ts` `findSimilarRecentArticle`, `story-cluster.ts`, `pipeline.ts` | bench table above; `articles.integration.test.ts` compares it with the exhaustive scan (`findSimilarRecentArticleExact`) |
| The cluster lock is per story (two locks in a fixed order), taken only to start a new cluster, held for two key reads and two writes; joining an existing cluster takes none | `articles.ts` `assignStoryCluster` | tests: mutual race, eight stories on one candidate → one cluster, a join and an unrelated pair do not wait on someone else's lock |
| `turkishFold` remembers each character's lower-case form (identical output) and `prepareText` folds a story once per crawl, not once per monitoring | `turkish.ts`, `keyword-match.ts` | equivalence test over every code point below U+3000; bench Node CPU 28.7 s → 2.6 s |
| Coverage counts by `fetched_at` | `sources.ts` | EXPLAIN: 96 ms parallel seq scan → 5.9 ms index-only scan |
| RSS connector and crawl job take injectable fetcher/connector (production passes nothing) | `rss-connector.ts`, `crawl-source.ts` | used by the benchmark; existing tests unchanged |

Known trade-off of the clustering change: a look-alike that shares none of the six longest words of the headline
is no longer found, and a stored story without a search vector is not a candidate (every story stored by
`insertArticle` has one). On the bench data the recall against the exhaustive scan was 100 % (60 exact copies, plus
look-alikes with a word changed or swapped in the integration test); real headlines are the open question — watch
the share of stories that end up in a cluster before and after (`count(story_cluster_id)/count(*)` for a day of
stories) and say if it falls.

## Checking it on Railway (before / after)

Postgres CPU is the number to move. Compare **two equal windows** (for example the 6 hours before the deploy and the
6 hours after, on a weekday), reading from the Railway service graphs and Query Statistics:

1. Postgres service → Metrics: average and peak vCPU, memory, network. Note both windows' values.
2. Query Statistics (after enabling it): sort by "Total time". Before the change the `select id, story_cluster_id from
   articles where source_id != $1 … similarity(…)` statement should dominate; after, it should be a few percent.
   Note `calls`, `mean_exec_time`, `total_exec_time` for it, for `insert into articles`, `findExistingArticle`'s
   select and the alert statistics statements.
3. Waits: `select count(*) from pg_stat_activity where wait_event_type = 'Lock'` while crawling — the five waiters on
   the cluster lock should be gone.
4. Worker service → Metrics: vCPU and memory (expected to move less: it is 1.76 $).
5. The invoice's Postgres CPU line, a week later. Do not expect it to fall by the vCPU ratio of the bench: the
   average includes the work this change does not touch (alert pollers, re-visit processing, web queries).

`docs/deployment/postgres-diagnostics.sql` holds the read-only queries for steps 2–3 and for table/index sizes,
`idx_scan`, dead tuples and last autovacuum.

## Enabling Query Statistics (not done automatically)

1. `SHOW shared_preload_libraries;` — if it already lists `pg_stat_statements`, only step 2 is needed.
2. As the database owner, once per database: `CREATE EXTENSION IF NOT EXISTS pg_stat_statements;` (no restart).
3. If step 1 did not list it, the library must be preloaded, which needs a Postgres restart: set the service's start
   command to `docker-entrypoint.sh postgres -c shared_preload_libraries=pg_stat_statements -c pg_stat_statements.track=all`
   (keep any preload already listed), redeploy in a quiet window — a short interruption of every service that
   uses the database — then run step 2. It stores no data of ours, only statement texts without values.

Nothing in the application depends on it, so it is deliberately not in a migration: a migration that fails would
stop the worker from booting.
