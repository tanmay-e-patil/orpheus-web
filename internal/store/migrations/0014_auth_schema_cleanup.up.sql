-- Sessions are JWT cookies; nothing reads these better-auth tables.
DROP TABLE IF EXISTS "session";
--> statement-breakpoint
DROP TABLE IF EXISTS "verification";
--> statement-breakpoint
DELETE FROM account AS older
USING account AS newer
WHERE older.user_id = newer.user_id
  AND older.provider_id = newer.provider_id
  AND (older.updated_at, older.id) < (newer.updated_at, newer.id);
--> statement-breakpoint
ALTER TABLE account
  DROP COLUMN IF EXISTS account_id,
  DROP COLUMN IF EXISTS access_token,
  DROP COLUMN IF EXISTS refresh_token,
  DROP COLUMN IF EXISTS id_token,
  DROP COLUMN IF EXISTS access_token_expires_at,
  DROP COLUMN IF EXISTS refresh_token_expires_at,
  DROP COLUMN IF EXISTS scope;
--> statement-breakpoint
CREATE UNIQUE INDEX account_user_provider_idx ON account (user_id, provider_id);
--> statement-breakpoint
DROP INDEX IF EXISTS account_user_id_idx;
--> statement-breakpoint
CREATE UNIQUE INDEX user_email_lower_idx ON "user" (lower(email));
--> statement-breakpoint
ALTER TABLE "user" DROP CONSTRAINT IF EXISTS user_email_unique;
--> statement-breakpoint
DROP INDEX IF EXISTS passkeys_credential_id_idx;
