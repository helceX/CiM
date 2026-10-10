CREATE UNIQUE INDEX IF NOT EXISTS "mentions_org_id_uidx" ON "mentions" ("organization_id", "id");

CREATE TABLE IF NOT EXISTS "opportunity_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
	"organization_type" text DEFAULT 'company' NOT NULL,
	"sector" text DEFAULT '' NOT NULL,
	"startup_stage" text DEFAULT '' NOT NULL,
	"operating_regions" text[] DEFAULT '{}'::text[] NOT NULL,
	"sectors" text[] DEFAULT '{}'::text[] NOT NULL,
	"technologies" text[] DEFAULT '{}'::text[] NOT NULL,
	"themes" text[] DEFAULT '{}'::text[] NOT NULL,
	"opportunity_types" text[] DEFAULT '{}'::text[] NOT NULL,
	"eligibility_constraints" text[] DEFAULT '{}'::text[] NOT NULL,
	"languages" text[] DEFAULT ARRAY['tr']::text[] NOT NULL,
	"created_at" timestamptz DEFAULT now() NOT NULL,
	"updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "opportunity_profiles_org_uidx" ON "opportunity_profiles" ("organization_id");

CREATE TABLE IF NOT EXISTS "opportunity_followups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
	"mention_id" uuid NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"assigned_to_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
	"note" text DEFAULT '' NOT NULL,
	"due_at" timestamptz,
	"source_verified_at" timestamptz,
	"updated_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
	"created_at" timestamptz DEFAULT now() NOT NULL,
	"updated_at" timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT "opportunity_followups_status_check" CHECK ("status" IN ('new', 'reviewing', 'possibly_eligible', 'not_eligible', 'planning', 'preparing', 'submitted', 'won', 'pending_outcome', 'not_awarded', 'archived')),
	CONSTRAINT "opportunity_followups_org_mention_fk" FOREIGN KEY ("organization_id", "mention_id") REFERENCES "mentions"("organization_id", "id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "opportunity_followups_org_mention_uidx" ON "opportunity_followups" ("organization_id", "mention_id");
CREATE INDEX IF NOT EXISTS "opportunity_followups_org_status_due_idx" ON "opportunity_followups" ("organization_id", "status", "due_at");
