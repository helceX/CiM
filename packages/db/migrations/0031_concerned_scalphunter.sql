ALTER TABLE "email_outbox" ADD COLUMN "delivered_via" text;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD COLUMN "last_error" text;