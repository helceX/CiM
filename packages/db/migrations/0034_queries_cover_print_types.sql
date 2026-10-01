-- "newspaper" and "magazine" are new source types that live under the News
-- category. Existing queries that already cover news/press must keep matching
-- them, so add the two types to every such query (idempotent).
UPDATE "monitoring_queries"
SET "source_types" = (
  SELECT array_agg(DISTINCT t)
  FROM unnest("source_types" || ARRAY['newspaper', 'magazine']) AS t
)
WHERE ("source_types" @> ARRAY['news'] OR "source_types" @> ARRAY['press'])
  AND NOT ("source_types" @> ARRAY['newspaper', 'magazine']);
