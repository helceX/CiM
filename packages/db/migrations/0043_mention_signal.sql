ALTER TABLE "mentions" ADD COLUMN "signal_score" smallint;--> statement-breakpoint
ALTER TABLE "mentions" ADD COLUMN "signal_reasons" jsonb;--> statement-breakpoint
CREATE INDEX "mentions_unscored_idx" ON "mentions" USING btree ("created_at") WHERE "mentions"."signal_reasons" is null;
--> statement-breakpoint
CREATE INDEX "articles_story_cluster_idx" ON "articles" USING btree ("story_cluster_id") WHERE "articles"."story_cluster_id" is not null;
