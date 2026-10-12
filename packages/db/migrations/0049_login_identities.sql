CREATE TABLE IF NOT EXISTS "login_identities" (
 "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
 "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
 "provider" text NOT NULL,
 "subject" text NOT NULL,
 "created_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "login_identity_provider_subject" ON "login_identities" ("provider", "subject");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "login_identity_user_provider" ON "login_identities" ("user_id", "provider");
