-- Store WebAuthn backup flags required by go-webauthn login validation.
-- Existing passkeys were created before these flags were persisted. Most platform/synced
-- passkeys are backup-eligible, so backfill that value to avoid rejecting them on login.

ALTER TABLE passkeys ADD COLUMN IF NOT EXISTS backup_eligible BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE passkeys ADD COLUMN IF NOT EXISTS backup_state BOOLEAN NOT NULL DEFAULT false;
