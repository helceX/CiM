CREATE TABLE "catalog_import_state" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_run_at" timestamp with time zone,
	"last_note" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_import_state_single_row" CHECK ("id" = 1)
);
--> statement-breakpoint
CREATE TABLE "catalog_import_attempts" (
	"url" text PRIMARY KEY NOT NULL,
	"catalog_key" text NOT NULL,
	"status" text NOT NULL,
	"error" text,
	"attempts" integer DEFAULT 1 NOT NULL,
	"attempted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "catalog_import_state" ("id", "enabled") VALUES (1, true);
