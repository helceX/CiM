CREATE TABLE "entities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entity_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" uuid NOT NULL,
	"alias" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "insight_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"insight_id" uuid NOT NULL,
	"mention_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "insights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"summary" text NOT NULL,
	"confidence" numeric(4, 3) NOT NULL,
	"method" text NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mention_entities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mention_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"salience" numeric(4, 3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mention_topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mention_id" uuid NOT NULL,
	"topic_id" uuid NOT NULL,
	"confidence" numeric(4, 3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mentions" ADD COLUMN "ai_status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "mentions" ADD COLUMN "ai_summary" text;--> statement-breakpoint
ALTER TABLE "mentions" ADD COLUMN "ai_method" text;--> statement-breakpoint
ALTER TABLE "mentions" ADD COLUMN "ai_analyzed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "entity_aliases" ADD CONSTRAINT "entity_aliases_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insight_evidence" ADD CONSTRAINT "insight_evidence_insight_id_insights_id_fk" FOREIGN KEY ("insight_id") REFERENCES "public"."insights"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insight_evidence" ADD CONSTRAINT "insight_evidence_mention_id_mentions_id_fk" FOREIGN KEY ("mention_id") REFERENCES "public"."mentions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insights" ADD CONSTRAINT "insights_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insights" ADD CONSTRAINT "insights_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mention_entities" ADD CONSTRAINT "mention_entities_mention_id_mentions_id_fk" FOREIGN KEY ("mention_id") REFERENCES "public"."mentions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mention_entities" ADD CONSTRAINT "mention_entities_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mention_topics" ADD CONSTRAINT "mention_topics_mention_id_mentions_id_fk" FOREIGN KEY ("mention_id") REFERENCES "public"."mentions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mention_topics" ADD CONSTRAINT "mention_topics_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "entities_name_idx" ON "entities" USING btree ("name");--> statement-breakpoint
CREATE INDEX "entity_aliases_entity_idx" ON "entity_aliases" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "entity_aliases_alias_idx" ON "entity_aliases" USING btree ("alias");--> statement-breakpoint
CREATE INDEX "insight_evidence_insight_idx" ON "insight_evidence" USING btree ("insight_id");--> statement-breakpoint
CREATE INDEX "insights_org_project_created_idx" ON "insights" USING btree ("organization_id","project_id","created_at");--> statement-breakpoint
CREATE INDEX "mention_entities_mention_idx" ON "mention_entities" USING btree ("mention_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mention_entities_mention_entity_uidx" ON "mention_entities" USING btree ("mention_id","entity_id");--> statement-breakpoint
CREATE INDEX "mention_topics_mention_idx" ON "mention_topics" USING btree ("mention_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mention_topics_mention_topic_uidx" ON "mention_topics" USING btree ("mention_id","topic_id");--> statement-breakpoint
CREATE UNIQUE INDEX "topics_name_uidx" ON "topics" USING btree ("name");--> statement-breakpoint
CREATE INDEX "mentions_ai_status_idx" ON "mentions" USING btree ("ai_status");