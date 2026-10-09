-- Read-only diagnostics for the production Postgres (Railway → Postgres → Data → Query, or psql).
-- Nothing here writes or locks anything. Run a block at a time; each one says what it answers and what to do.
-- See docs/architecture/CRAWL_COST.md for the reasoning.

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 1. Is Query Statistics available? (the log line "pg_stat_statements does not exist")
-- ─────────────────────────────────────────────────────────────────────────────────────────────
SHOW shared_preload_libraries;                       -- must list pg_stat_statements for the view to work (needs the superuser)
SELECT name, default_version, installed_version FROM pg_available_extensions WHERE name = 'pg_stat_statements';
-- If preloaded but not installed in this database (installed_version is null), as the owner:
--   CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
-- If it is not preloaded, see "Enabling Query Statistics" in docs/architecture/CRAWL_COST.md (needs a restart).

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 2. The most expensive statements (needs section 1 done; stats start at the moment it is created)
-- ─────────────────────────────────────────────────────────────────────────────────────────────
SELECT calls,
       round(total_exec_time::numeric / 1000, 1)  AS total_seconds,
       round(mean_exec_time::numeric, 2)          AS mean_ms,
       rows,
       left(regexp_replace(query, '\s+', ' ', 'g'), 140) AS query
FROM pg_stat_statements
WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
ORDER BY total_exec_time DESC
LIMIT 15;
-- Expect, before the clustering change: "select id, story_cluster_id from articles where source_id != …
-- similarity(…)" at the top. After it: insert into articles / the alert statistics / mentions inserts.

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 3. Index usage — decide whether an index is really unused BEFORE anyone drops it
-- ─────────────────────────────────────────────────────────────────────────────────────────────
SELECT s.relname                                        AS table_name,
       s.indexrelname                                   AS index_name,
       pg_size_pretty(pg_relation_size(s.indexrelid))   AS size,
       s.idx_scan                                       AS scans_since_stats_reset,
       s.idx_tup_read,
       (SELECT stats_reset FROM pg_stat_database WHERE datname = current_database()) AS stats_reset,
       i.indisunique                                    AS is_unique,
       pg_get_indexdef(s.indexrelid)                    AS definition
FROM pg_stat_user_indexes s
JOIN pg_index i ON i.indexrelid = s.indexrelid
ORDER BY pg_relation_size(s.indexrelid) DESC
LIMIT 25;
-- Read it like this:
--   * A UNIQUE index (articles_content_hash_uidx, articles_canonical_url_uidx, mentions_query_article_uidx …) is a
--     constraint: it is never "unused", whatever idx_scan says. Do not drop it.
--   * articles_title_trgm_idx: code review shows no query can use it (see CRAWL_COST.md F7). If scans_since_stats_reset
--     is 0 and stats_reset is more than a few days old, it is safe to drop — reversibly:
--         DROP INDEX CONCURRENTLY IF EXISTS articles_title_trgm_idx;           -- run outside a transaction
--         -- to undo:  CREATE INDEX CONCURRENTLY articles_title_trgm_idx ON articles USING gin (title gin_trgm_ops);
--     Keep a note of the size you freed and of Postgres CPU in the next hours (inserts get cheaper).
--   * Any other index with 0 scans: check the code (grep the column) and the plans of the queries on that table before
--     deciding. A foreign-key index (articles_source_idx, mentions_article_idx …) is also used by cascade deletes
--     that happen rarely and would otherwise scan the table.

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 4. Tables: size, churn, dead rows, when they were last vacuumed/analyzed
-- ─────────────────────────────────────────────────────────────────────────────────────────────
SELECT relname,
       pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
       pg_size_pretty(pg_relation_size(relid))       AS table_size,
       pg_size_pretty(pg_indexes_size(relid))        AS index_size,
       n_live_tup, n_dead_tup,
       round(100.0 * n_dead_tup / greatest(n_live_tup + n_dead_tup, 1), 1) AS dead_pct,
       n_tup_ins, n_tup_upd, n_tup_hot_upd, n_tup_del,
       last_autovacuum, last_autoanalyze, autovacuum_count
FROM pg_stat_user_tables
ORDER BY pg_total_relation_size(relid) DESC
LIMIT 15;
-- dead_pct above ~20 % on a big table, or last_autovacuum days old on a table that is written all day, means
-- autovacuum is not keeping up. Then (off-peak) run `VACUUM (ANALYZE, VERBOSE) <table>;` — it does not lock reads
-- or writes. Avoid VACUUM FULL: it rewrites the table under an exclusive lock.
-- sources is updated at every crawl (n_tup_upd, n_tup_hot_upd should be close: HOT updates are cheap).

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 5. Right now: who is waiting for what, and for how long
-- ─────────────────────────────────────────────────────────────────────────────────────────────
SELECT pid, state, wait_event_type, wait_event, now() - query_start AS running_for,
       left(regexp_replace(query, '\s+', ' ', 'g'), 120) AS query
FROM pg_stat_activity
WHERE datname = current_database() AND pid <> pg_backend_pid() AND state <> 'idle'
ORDER BY query_start;
-- wait_event_type = 'Lock' with wait_event = 'advisory' used to be the cluster lock. After the change it should
-- be rare and short.

SELECT state, count(*) FROM pg_stat_activity WHERE datname = current_database() GROUP BY state;   -- connection use

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 6. Cache hit ratio and temp-file spill
-- ─────────────────────────────────────────────────────────────────────────────────────────────
SELECT round(100.0 * blks_hit / greatest(blks_hit + blks_read, 1), 2) AS cache_hit_pct, temp_files, pg_size_pretty(temp_bytes) AS temp_size
FROM pg_stat_database WHERE datname = current_database();

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 7. Is clustering still finding look-alikes? (compare before / after the change)
-- ─────────────────────────────────────────────────────────────────────────────────────────────
SELECT round(100.0 * count(story_cluster_id) / greatest(count(*), 1), 2) AS clustered_pct, count(*) AS stories
FROM articles WHERE fetched_at >= now() - interval '24 hours';
