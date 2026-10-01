CREATE TABLE "social_connection_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"kind" text NOT NULL,
	"external_id" text NOT NULL,
	"url" text NOT NULL,
	"author_handle" text,
	"author_name" text,
	"excerpt" text DEFAULT '' NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"connected_by_user_id" uuid,
	"platform" text NOT NULL,
	"external_account_id" text NOT NULL,
	"handle" text NOT NULL,
	"display_name" text,
	"profile_url" text,
	"avatar_url" text,
	"access_token_enc" text NOT NULL,
	"refresh_token_enc" text,
	"scopes" text DEFAULT '' NOT NULL,
	"token_expires_at" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"last_sync_at" timestamp with time zone,
	"last_error" text,
	"cursor" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "link_url" text;--> statement-breakpoint
ALTER TABLE "social_connection_events" ADD CONSTRAINT "social_connection_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_connection_events" ADD CONSTRAINT "social_connection_events_connection_id_social_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."social_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_connections" ADD CONSTRAINT "social_connections_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_connections" ADD CONSTRAINT "social_connections_connected_by_user_id_users_id_fk" FOREIGN KEY ("connected_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "social_connection_events_uidx" ON "social_connection_events" USING btree ("connection_id","external_id");--> statement-breakpoint
CREATE INDEX "social_connection_events_org_time_idx" ON "social_connection_events" USING btree ("organization_id","occurred_at");--> statement-breakpoint
CREATE INDEX "social_connections_org_idx" ON "social_connections" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "social_connections_org_platform_account_uidx" ON "social_connections" USING btree ("organization_id","platform","external_account_id");