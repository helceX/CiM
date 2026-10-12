-- Small nullable metadata only: no article rewrite, index or full-text storage.
-- The nullable column may be prepared before the web rollout, since the worker
-- is the migration owner and its container can become ready after the web.
ALTER TABLE "articles" ADD COLUMN IF NOT EXISTS "social_mention_handles" jsonb;
