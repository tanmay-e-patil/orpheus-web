//go:build integration

package apphttp

import (
	"testing"

	"orpheus-web/internal/config"
	"orpheus-web/internal/testutil"
)

func legacyAuth(t *testing.T) *AuthService {
	t.Helper()
	db, _, _ := testutil.Postgres(t)
	return NewAuthService(config.Config{
		AuthCookieSecret: "test-secret-key-at-least-32-bytes!",
		AuthUsername:     "owner@example.com",
		AuthPassword:     "env-password",
	}, db)
}

func TestLegacyPasswordProvisionsMissingAccount(t *testing.T) {
	auth := legacyAuth(t)
	if _, ok := auth.ValidateCredentials("owner@example.com", "env-password"); !ok {
		t.Fatal("legacy credentials rejected on an empty database")
	}
	if _, ok := auth.ValidateCredentials("owner@example.com", "env-password"); !ok {
		t.Fatal("migrated password rejected")
	}
}

func TestLegacyPasswordCannotOverrideDatabasePassword(t *testing.T) {
	auth := legacyAuth(t)
	if _, err := auth.RegisterUser("owner", "owner@example.com", "database-password"); err != nil {
		t.Fatal(err)
	}
	if _, ok := auth.ValidateCredentials("owner@example.com", "env-password"); ok {
		t.Fatal("legacy env password accepted for an account with a database password")
	}
	if _, ok := auth.ValidateCredentials("owner@example.com", "database-password"); !ok {
		t.Fatal("database password stopped working after a legacy attempt")
	}
}
