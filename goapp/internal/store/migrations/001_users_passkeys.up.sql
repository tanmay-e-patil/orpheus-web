-- Users table: replaces single-user env-var credentials
CREATE TABLE IF NOT EXISTS users (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username   TEXT NOT NULL UNIQUE,
    email      TEXT NOT NULL UNIQUE,
    password   TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Passkey credentials: WebAuthn public key credentials
CREATE TABLE IF NOT EXISTS passkeys (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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
