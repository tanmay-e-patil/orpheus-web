CREATE TABLE IF NOT EXISTS native_login_grants (
    code_hash BYTEA PRIMARY KEY,
    request_hash BYTEA NOT NULL UNIQUE,
    code_challenge TEXT NOT NULL,
    user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    request_expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS native_login_grants_expiry_idx ON native_login_grants(request_expires_at);
