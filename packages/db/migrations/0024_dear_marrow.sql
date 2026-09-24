DROP INDEX "articles_content_hash_idx";--> statement-breakpoint
DROP INDEX "articles_canonical_url_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "articles_content_hash_uidx" ON "articles" USING btree ("content_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "articles_canonical_url_uidx" ON "articles" USING btree ("canonical_url");