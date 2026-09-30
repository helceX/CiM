CREATE TABLE "credit_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"kind" text NOT NULL,
	"amount" integer NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"ref_id" text
);
--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "credit_ledger_org_occurred_idx" ON "credit_ledger" USING btree ("organization_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_ledger_org_kind_ref_uniq" ON "credit_ledger" USING btree ("organization_id","kind","ref_id") WHERE "credit_ledger"."ref_id" is not null;