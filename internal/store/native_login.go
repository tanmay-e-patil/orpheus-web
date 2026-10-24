package store

import (
	"context"
	"time"
)

// CreateNativeLoginGrant stores only hashes of the callback code and signed request ID.
// The unique request hash prevents a browser flow from authorizing more than once.
func (s *Store) CreateNativeLoginGrant(ctx context.Context, codeHash, requestHash []byte, challenge, userID string, expires, requestExpires time.Time) error {
	if _, err := s.Pool.Exec(ctx, `DELETE FROM native_login_grants WHERE request_expires_at <= now()`); err != nil {
		return err
	}
	_, err := s.Pool.Exec(ctx, `INSERT INTO native_login_grants(code_hash, request_hash, code_challenge, user_id, expires_at, request_expires_at) VALUES($1,$2,$3,$4,$5,$6)`, codeHash, requestHash, challenge, userID, expires, requestExpires)
	return err
}

// The update returns a grant at most once, even across server replicas. Retaining
// the consumed row until the request expires also prevents browser-request replay.
func (s *Store) ConsumeNativeLoginGrant(ctx context.Context, codeHash []byte, challenge string) (string, error) {
	var userID string
	err := s.Pool.QueryRow(ctx, `UPDATE native_login_grants SET consumed_at=now() WHERE code_hash=$1 AND code_challenge=$2 AND expires_at > now() AND consumed_at IS NULL RETURNING user_id`, codeHash, challenge).Scan(&userID)
	return userID, err
}
