-- Production was inspected before removal: 207 MB, zero scans, non-unique.
-- Removed there with DROP INDEX CONCURRENTLY; IF EXISTS also handles that case.
-- No articles or mentions are deleted. Fresh databases no longer maintain it.
DROP INDEX IF EXISTS "articles_title_trgm_idx";
