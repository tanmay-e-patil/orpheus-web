package store

import (
	"context"
	"time"
)

type User struct {
	ID              string
	Name            string
	Email           string
	EmailVerified   bool
	Image           *string
	Username        *string
	DisplayUsername *string
	CreatedAt       time.Time
	UpdatedAt       time.Time
}

func (s *Store) CreateUser(ctx context.Context, id, name, email, username string) (*User, error) {
	var u User
	err := s.Pool.QueryRow(ctx, `
		INSERT INTO "user" (id, name, email, email_verified, username, display_username, created_at, updated_at)
		VALUES ($1, $2, $3, false, $4, $4, now(), now())
		RETURNING id, name, email, email_verified, image, username, display_username, created_at, updated_at
	`, id, name, email, username).Scan(
		&u.ID, &u.Name, &u.Email, &u.EmailVerified, &u.Image,
		&u.Username, &u.DisplayUsername, &u.CreatedAt, &u.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &u, nil
}

func (s *Store) GetUserByEmail(ctx context.Context, email string) (*User, error) {
	var u User
	err := s.Pool.QueryRow(ctx, `
		SELECT id, name, email, email_verified, image, username, display_username, created_at, updated_at
		FROM "user" WHERE email = $1
	`, email).Scan(
		&u.ID, &u.Name, &u.Email, &u.EmailVerified, &u.Image,
		&u.Username, &u.DisplayUsername, &u.CreatedAt, &u.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &u, nil
}

func (s *Store) GetUserByUsername(ctx context.Context, username string) (*User, error) {
	var u User
	err := s.Pool.QueryRow(ctx, `
		SELECT id, name, email, email_verified, image, username, display_username, created_at, updated_at
		FROM "user" WHERE username = $1
	`, username).Scan(
		&u.ID, &u.Name, &u.Email, &u.EmailVerified, &u.Image,
		&u.Username, &u.DisplayUsername, &u.CreatedAt, &u.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &u, nil
}

func (s *Store) GetUserByID(ctx context.Context, id string) (*User, error) {
	var u User
	err := s.Pool.QueryRow(ctx, `
		SELECT id, name, email, email_verified, image, username, display_username, created_at, updated_at
		FROM "user" WHERE id = $1
	`, id).Scan(
		&u.ID, &u.Name, &u.Email, &u.EmailVerified, &u.Image,
		&u.Username, &u.DisplayUsername, &u.CreatedAt, &u.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &u, nil
}

// GetPasswordForUser fetches the stored password hash from the account table
// (better-auth stores it there with provider_id = 'credential').
func (s *Store) GetPasswordForUser(ctx context.Context, userID string) (string, error) {
	var password *string
	err := s.Pool.QueryRow(ctx, `
		SELECT password FROM account WHERE user_id = $1 AND provider_id = 'credential'
	`, userID).Scan(&password)
	if err != nil {
		return "", err
	}
	if password == nil {
		return "", nil
	}
	return *password, nil
}

// SetPasswordForUser creates or updates the password in the account table.
func (s *Store) SetPasswordForUser(ctx context.Context, userID, hashedPassword string) error {
	var count int
	err := s.Pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM account WHERE user_id = $1 AND provider_id = 'credential'
	`, userID).Scan(&count)
	if err != nil {
		return err
	}
	if count > 0 {
		_, err = s.Pool.Exec(ctx, `
			UPDATE account SET password = $1, updated_at = now()
			WHERE user_id = $2 AND provider_id = 'credential'
		`, hashedPassword, userID)
		return err
	}
	// Insert a credential account row
	_, err = s.Pool.Exec(ctx, `
		INSERT INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at)
		VALUES (gen_random_uuid()::text, $1, 'credential', $1, $2, now(), now())
	`, userID, hashedPassword)
	return err
}

// CreateAccountForUser creates a credential account entry for a new user.
func (s *Store) CreateAccountForUser(ctx context.Context, userID, hashedPassword string) error {
	_, err := s.Pool.Exec(ctx, `
		INSERT INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at)
		VALUES (gen_random_uuid()::text, $1, 'credential', $1, $2, now(), now())
	`, userID, hashedPassword)
	return err
}

func (u *User) DisplayName() string {
	if u.Username != nil && *u.Username != "" {
		return *u.Username
	}
	if u.DisplayUsername != nil && *u.DisplayUsername != "" {
		return *u.DisplayUsername
	}
	return u.Name
}

func (s *Store) UserExists(ctx context.Context) (bool, error) {
	var exists bool
	err := s.Pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM "user")`).Scan(&exists)
	return exists, err
}
