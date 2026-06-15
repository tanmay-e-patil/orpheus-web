-- Migration: Add passkey support to existing schema
-- The "user" and "account" tables may already exist from an earlier auth implementation.
-- Passwords are stored in account.password where provider_id = "credential".
-- This migration only adds the passkeys table.

CREATE TABLE IF NOT EXISTS passkeys (
    id             TEXT PRIMARY KEY,
    user_id        TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    credential_id  BYTEA NOT NULL UNIQUE,
    public_key     BYTEA NOT NULL,
    attestation    BYTEA,
    transport      TEXT[] NOT NULL DEFAULT '{}',
    sign_count     BIGINT NOT NULL DEFAULT 0,
    name           TEXT NOT NULL DEFAULT 'primary',
    aaguid         BYTEA,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS passkeys_user_id_idx ON passkeys(user_id);
CREATE INDEX IF NOT EXISTS passkeys_credential_id_idx ON passkeys(credential_id);
