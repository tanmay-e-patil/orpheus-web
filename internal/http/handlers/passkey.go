package handlers

import (
	"context"
	"encoding/json"
	"net/http"

	"orpheus-web/internal/store"
)

type PasskeyAuthenticator interface {
	CreateSessionToken(userID, username string) (string, error)
	SetSessionCookie(w http.ResponseWriter, token string)
	UserAndUsernameFromRequest(r *http.Request) (userID string, username string, err error)
	HasPasskey(userID string) bool
}

type PasskeyCeremony interface {
	BeginRegistration(w http.ResponseWriter, r *http.Request, userID string) (json.RawMessage, error)
	FinishRegistration(w http.ResponseWriter, r *http.Request, userID string, name string) error
	BeginLogin(w http.ResponseWriter, r *http.Request) (json.RawMessage, error)
	FinishLogin(w http.ResponseWriter, r *http.Request) (string, error)
}

type UserFinder interface {
	GetUserByID(ctx context.Context, id string) (*store.User, error)
}

type PasskeyStore interface {
	GetPasskeysByUserID(ctx context.Context, userID string) ([]store.Passkey, error)
	GetPasskeyByID(ctx context.Context, id string) (*store.Passkey, error)
	DeletePasskey(ctx context.Context, id string) error
}

type passkeyResponse struct {
	ID        string   `json:"id"`
	Name      string   `json:"name"`
	Transport []string `json:"transport"`
	CreatedAt string   `json:"createdAt"`
}

func PasskeyStatus(auth PasskeyAuthenticator) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, _, err := auth.UserAndUsernameFromRequest(r)
		if err != nil {
			JSON(w, http.StatusOK, map[string]bool{"hasPasskey": false})
			return
		}
		JSON(w, http.StatusOK, map[string]bool{"hasPasskey": auth.HasPasskey(userID)})
	}
}

func PasskeyRegisterBegin(auth PasskeyAuthenticator, ceremony PasskeyCeremony) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, _, err := auth.UserAndUsernameFromRequest(r)
		if err != nil {
			Error(w, http.StatusUnauthorized, "unauthorized", "Unauthorized")
			return
		}
		options, err := ceremony.BeginRegistration(w, r, userID)
		if err != nil {
			Error(w, http.StatusInternalServerError, "register_begin_failed", err.Error())
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write(options)
	}
}

func PasskeyList(auth PasskeyAuthenticator, passkeys PasskeyStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, _, err := auth.UserAndUsernameFromRequest(r)
		if err != nil {
			Error(w, http.StatusUnauthorized, "unauthorized", "Unauthorized")
			return
		}

		pks, err := passkeys.GetPasskeysByUserID(r.Context(), userID)
		if err != nil {
			Error(w, http.StatusInternalServerError, "passkey_list_failed", "Could not load passkeys")
			return
		}

		items := make([]passkeyResponse, 0, len(pks))
		for _, pk := range pks {
			items = append(items, passkeyResponse{
				ID:        pk.ID,
				Name:      pk.Name,
				Transport: pk.Transport,
				CreatedAt: pk.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
			})
		}
		JSON(w, http.StatusOK, map[string]any{"passkeys": items})
	}
}

func PasskeyDelete(auth PasskeyAuthenticator, passkeys PasskeyStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, _, err := auth.UserAndUsernameFromRequest(r)
		if err != nil {
			Error(w, http.StatusUnauthorized, "unauthorized", "Unauthorized")
			return
		}

		id := r.PathValue("id")
		pk, err := passkeys.GetPasskeyByID(r.Context(), id)
		if err != nil || pk.UserID != userID {
			Error(w, http.StatusNotFound, "passkey_not_found", "Passkey not found")
			return
		}
		if err := passkeys.DeletePasskey(r.Context(), id); err != nil {
			Error(w, http.StatusInternalServerError, "passkey_delete_failed", "Could not delete passkey")
			return
		}
		JSON(w, http.StatusOK, map[string]bool{"ok": true})
	}
}

func PasskeyRegisterFinish(auth PasskeyAuthenticator, ceremony PasskeyCeremony) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, _, err := auth.UserAndUsernameFromRequest(r)
		if err != nil {
			Error(w, http.StatusUnauthorized, "unauthorized", "Unauthorized")
			return
		}
		name := r.URL.Query().Get("name")
		if err := ceremony.FinishRegistration(w, r, userID, name); err != nil {
			Error(w, http.StatusBadRequest, "register_finish_failed", err.Error())
			return
		}
		JSON(w, http.StatusOK, map[string]bool{"ok": true})
	}
}

func PasskeyLoginBegin(ceremony PasskeyCeremony) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		options, err := ceremony.BeginLogin(w, r)
		if err != nil {
			Error(w, http.StatusInternalServerError, "login_begin_failed", err.Error())
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write(options)
	}
}

func PasskeyLoginFinish(auth PasskeyAuthenticator, ceremony PasskeyCeremony, users UserFinder) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, err := ceremony.FinishLogin(w, r)
		if err != nil {
			Error(w, http.StatusUnauthorized, "login_finish_failed", err.Error())
			return
		}

		user, err := users.GetUserByID(r.Context(), userID)
		if err != nil {
			Error(w, http.StatusInternalServerError, "user_not_found", "User not found")
			return
		}

		token, err := auth.CreateSessionToken(user.ID, user.DisplayName())
		if err != nil {
			Error(w, http.StatusInternalServerError, "session_failed", "Could not create session")
			return
		}

		if r.Header.Get("X-Client") == "expo" {
			JSON(w, http.StatusOK, map[string]any{
				"token": token,
				"user": map[string]string{
					"id":       user.ID,
					"username": user.DisplayName(),
					"email":    user.Email,
				},
			})
			return
		}

		auth.SetSessionCookie(w, token)
		JSON(w, http.StatusOK, map[string]any{
			"authenticated": true,
			"user": map[string]string{
				"id":       user.ID,
				"username": user.DisplayName(),
			},
		})
	}
}
