ALTER TABLE "reports" ADD COLUMN "schedule_frequency" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "last_scheduled_run_at" timestamp with time zone;