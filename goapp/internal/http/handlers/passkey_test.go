package handlers

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"orpheus-goapp/internal/store"
)

type fakePasskeyAuth struct {
	userID string
}

func (a fakePasskeyAuth) CreateSessionToken(userID, username string) (string, error) { return "", nil }
func (a fakePasskeyAuth) SetSessionCookie(w http.ResponseWriter, token string)       {}
func (a fakePasskeyAuth) UserAndUsernameFromRequest(r *http.Request) (string, string, error) {
	return a.userID, "user", nil
}
func (a fakePasskeyAuth) HasPasskey(userID string) bool { return false }

type fakePasskeyStore struct {
	passkeys []store.Passkey
	deleted  string
}

func (s *fakePasskeyStore) GetPasskeysByUserID(ctx context.Context, userID string) ([]store.Passkey, error) {
	return s.passkeys, nil
}
func (s *fakePasskeyStore) GetPasskeyByID(ctx context.Context, id string) (*store.Passkey, error) {
	for _, pk := range s.passkeys {
		if pk.ID == id {
			return &pk, nil
		}
	}
	return nil, context.Canceled
}
func (s *fakePasskeyStore) DeletePasskey(ctx context.Context, id string) error {
	s.deleted = id
	return nil
}

func TestPasskeyListReturnsSafePasskeyMetadata(t *testing.T) {
	store := &fakePasskeyStore{passkeys: []store.Passkey{{
		ID:           "pk_1",
		UserID:       "user_1",
		Name:         "Passkey",
		Transport:    []string{"internal"},
		CreatedAt:    time.Date(2026, 5, 21, 12, 0, 0, 0, time.UTC),
		CredentialID: []byte("secret"),
	}}}
	recorder := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/auth/passkeys", nil)

	PasskeyList(fakePasskeyAuth{userID: "user_1"}, store).ServeHTTP(recorder, req)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", recorder.Code)
	}
	body := recorder.Body.String()
	for _, want := range []string{"pk_1", "Passkey", "internal"} {
		if !strings.Contains(body, want) {
			t.Fatalf("body missing %q: %s", want, body)
		}
	}
	if strings.Contains(body, "secret") {
		t.Fatalf("body leaked credential data: %s", body)
	}
}

func TestPasskeyDeleteOnlyDeletesOwnedPasskeys(t *testing.T) {
	store := &fakePasskeyStore{passkeys: []store.Passkey{{ID: "pk_1", UserID: "other_user"}}}
	recorder := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodDelete, "/api/auth/passkeys/pk_1", nil)
	req.SetPathValue("id", "pk_1")

	PasskeyDelete(fakePasskeyAuth{userID: "user_1"}, store).ServeHTTP(recorder, req)

	if recorder.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", recorder.Code)
	}
	if store.deleted != "" {
		t.Fatalf("deleted %q, want no deletion", store.deleted)
	}
}
