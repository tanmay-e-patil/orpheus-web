-- Restores structure only: dropped OAuth tokens, sessions, verifications, and
-- deduplicated credential rows are gone.
CREATE INDEX IF NOT EXISTS passkeys_credential_id_idx ON passkeys (credential_id);
--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT user_email_unique UNIQUE (email);
--> statement-breakpoint
DROP INDEX IF EXISTS user_email_lower_idx;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS account_user_id_idx ON account USING btree (user_id);
--> statement-breakpoint
DROP INDEX IF EXISTS account_user_provider_idx;
--> statement-breakpoint
ALTER TABLE account
  ADD COLUMN account_id text,
  ADD COLUMN access_token text,
  ADD COLUMN refresh_token text,
  ADD COLUMN id_token text,
  ADD COLUMN access_token_expires_at timestamp,
  ADD COLUMN refresh_token_expires_at timestamp,
  ADD COLUMN scope text;
--> statement-breakpoint
UPDATE account SET account_id = user_id;
--> statement-breakpoint
ALTER TABLE account ALTER COLUMN account_id SET NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS session_user_id_idx ON "session" USING btree (user_id);
