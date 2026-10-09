-- Additive and reversible (DROP INDEX "mentions_query_created_idx"). Serves the per-rule alert statistics
-- (docs/architecture/CRAWL_COST.md, F6): one query's mentions within the last hours/days.
CREATE INDEX IF NOT EXISTS "mentions_query_created_idx" ON "mentions" USING btree ("query_id","created_at");
