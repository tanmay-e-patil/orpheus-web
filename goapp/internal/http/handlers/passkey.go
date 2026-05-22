package handlers

import (
	"context"
	"encoding/json"
	"net/http"

	"orpheus-goapp/internal/store"
)

type PasskeyAuthenticator interface {
	CreateSessionToken(userID, username string) (string, error)
	SetSessionCookie(w http.ResponseWriter, token string)
	UserAndUsernameFromRequest(r *http.Request) (userID string, username string, err error)
	HasPasskey(userID string) bool
}

type PasskeyCeremony interface {
	BeginRegistration(w http.ResponseWriter, r *http.Request, userID string) (json.RawMessage, error)
	FinishRegistration(w http.ResponseWriter, r *http.Request, userID string) error
	BeginLogin(w http.ResponseWriter, r *http.Request) (json.RawMessage, error)
	FinishLogin(w http.ResponseWriter, r *http.Request) (string, error)
}

type UserFinder interface {
	GetUserByID(ctx context.Context, id string) (*store.User, error)
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

func PasskeyRegisterFinish(auth PasskeyAuthenticator, ceremony PasskeyCeremony) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, _, err := auth.UserAndUsernameFromRequest(r)
		if err != nil {
			Error(w, http.StatusUnauthorized, "unauthorized", "Unauthorized")
			return
		}
		if err := ceremony.FinishRegistration(w, r, userID); err != nil {
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

		token, err := auth.CreateSessionToken(user.ID, user.Username)
		if err != nil {
			Error(w, http.StatusInternalServerError, "session_failed", "Could not create session")
			return
		}

		if r.Header.Get("X-Client") == "expo" {
			JSON(w, http.StatusOK, map[string]any{
				"token": token,
				"user": map[string]string{
					"id":       user.ID,
					"username": user.Username,
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
				"username": user.Username,
			},
		})
	}
}
