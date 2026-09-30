CREATE TABLE "social_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform" text NOT NULL,
	"external_id" text NOT NULL,
	"handle" text NOT NULL,
	"display_name" text,
	"profile_url" text,
	"followers" integer,
	"following" integer,
	"verified" boolean,
	"account_type" text,
	"language" text,
	"country" text,
	"avatar_url" text,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "author_profile_id" uuid;--> statement-breakpoint
ALTER TABLE "mentions" ADD COLUMN "match_type" text;--> statement-breakpoint
ALTER TABLE "mentions" ADD COLUMN "match_confidence" numeric(4, 3);--> statement-breakpoint
ALTER TABLE "mentions" ADD COLUMN "matched_rule" text;--> statement-breakpoint
CREATE UNIQUE INDEX "social_profiles_platform_external_id_uidx" ON "social_profiles" USING btree ("platform","external_id");--> statement-breakpoint
CREATE INDEX "social_profiles_platform_idx" ON "social_profiles" USING btree ("platform");--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_author_profile_id_social_profiles_id_fk" FOREIGN KEY ("author_profile_id") REFERENCES "public"."social_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "articles_author_profile_idx" ON "articles" USING btree ("author_profile_id");