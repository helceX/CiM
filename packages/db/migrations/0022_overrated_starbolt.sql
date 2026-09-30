CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS unaccent;
--> statement-breakpoint
CREATE INDEX "articles_search_vector_idx" ON "articles" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "articles_title_trgm_idx" ON "articles" USING gin ("title" gin_trgm_ops);
