package store

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
)

type Passkey struct {
	ID           string
	UserID       string
	CredentialID []byte
	PublicKey    []byte
	Attestation  []byte
	Transport    []string
	SignCount    int64
	Name         string
	AAGUID       []byte
	CreatedAt    time.Time
}

func (s *Store) CreatePasskey(ctx context.Context, pk Passkey) error {
	_, err := s.Pool.Exec(ctx, `
		INSERT INTO passkeys (user_id, credential_id, public_key, attestation, transport, sign_count, name, aaguid)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
	`, pk.UserID, pk.CredentialID, pk.PublicKey, pk.Attestation, pk.Transport, pk.SignCount, pk.Name, pk.AAGUID)
	return err
}

func (s *Store) GetPasskeysByUserID(ctx context.Context, userID string) ([]Passkey, error) {
	rows, err := s.Pool.Query(ctx, `
		SELECT id, user_id, credential_id, public_key, attestation, transport, sign_count, name, aaguid, created_at
		FROM passkeys WHERE user_id = $1 ORDER BY created_at
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var pks []Passkey
	for rows.Next() {
		var pk Passkey
		if err := rows.Scan(&pk.ID, &pk.UserID, &pk.CredentialID, &pk.PublicKey, &pk.Attestation, &pk.Transport, &pk.SignCount, &pk.Name, &pk.AAGUID, &pk.CreatedAt); err != nil {
			return nil, err
		}
		pks = append(pks, pk)
	}
	return pks, rows.Err()
}

func (s *Store) GetPasskeyByCredentialID(ctx context.Context, credID []byte) (*Passkey, error) {
	var pk Passkey
	err := s.Pool.QueryRow(ctx, `
		SELECT id, user_id, credential_id, public_key, attestation, transport, sign_count, name, aaguid, created_at
		FROM passkeys WHERE credential_id = $1
	`, credID).Scan(&pk.ID, &pk.UserID, &pk.CredentialID, &pk.PublicKey, &pk.Attestation, &pk.Transport, &pk.SignCount, &pk.Name, &pk.AAGUID, &pk.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &pk, nil
}

func (s *Store) UpdatePasskeySignCount(ctx context.Context, id string, signCount int64) error {
	_, err := s.Pool.Exec(ctx, `
		UPDATE passkeys SET sign_count = $1 WHERE id = $2
	`, signCount, id)
	return err
}

func (s *Store) GetPasskeyByID(ctx context.Context, id string) (*Passkey, error) {
	var pk Passkey
	err := s.Pool.QueryRow(ctx, `
		SELECT id, user_id, credential_id, public_key, attestation, transport, sign_count, name, aaguid, created_at
		FROM passkeys WHERE id = $1
	`, id).Scan(&pk.ID, &pk.UserID, &pk.CredentialID, &pk.PublicKey, &pk.Attestation, &pk.Transport, &pk.SignCount, &pk.Name, &pk.AAGUID, &pk.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &pk, nil
}

func (s *Store) DeletePasskey(ctx context.Context, id string) error {
	_, err := s.Pool.Exec(ctx, `DELETE FROM passkeys WHERE id = $1`, id)
	if err != nil && err == pgx.ErrNoRows {
		return nil
	}
	return err
}
