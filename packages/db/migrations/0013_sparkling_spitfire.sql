CREATE TABLE "mention_tags" (
	"mention_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mention_tags_mention_id_tag_id_pk" PRIMARY KEY("mention_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mention_tags" ADD CONSTRAINT "mention_tags_mention_id_mentions_id_fk" FOREIGN KEY ("mention_id") REFERENCES "public"."mentions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mention_tags" ADD CONSTRAINT "mention_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mention_tags_tag_idx" ON "mention_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_org_name_lower_uidx" ON "tags" USING btree ("organization_id",lower("name"));--> statement-breakpoint
CREATE INDEX "tags_org_idx" ON "tags" USING btree ("organization_id");