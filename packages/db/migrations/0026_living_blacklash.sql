CREATE TABLE "brand_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'own' NOT NULL,
	"color" text DEFAULT 'blue' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "monitoring_queries" ADD COLUMN "brand_group_id" uuid;--> statement-breakpoint
ALTER TABLE "brand_groups" ADD CONSTRAINT "brand_groups_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_groups" ADD CONSTRAINT "brand_groups_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "brand_groups_org_project_idx" ON "brand_groups" USING btree ("organization_id","project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "brand_groups_project_name_uniq" ON "brand_groups" USING btree ("project_id",lower("name")) WHERE "brand_groups"."deleted_at" is null;--> statement-breakpoint
ALTER TABLE "monitoring_queries" ADD CONSTRAINT "monitoring_queries_brand_group_id_brand_groups_id_fk" FOREIGN KEY ("brand_group_id") REFERENCES "public"."brand_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "monitoring_queries_brand_group_idx" ON "monitoring_queries" USING btree ("brand_group_id");