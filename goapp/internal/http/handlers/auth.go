package handlers

import (
	"net/http"
	"strings"

	"orpheus-goapp/internal/store"
)

type Authenticator interface {
	ValidateCredentials(email, password string) (*store.User, bool)
	RegisterUser(username, email, password string) (*store.User, error)
	CreateSessionToken(userID, username string) (string, error)
	SetSessionCookie(w http.ResponseWriter, token string)
	ClearSessionCookie(w http.ResponseWriter)
	UserAndUsernameFromRequest(r *http.Request) (userID string, username string, err error)
	HasPasskey(userID string) bool
}

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type registerRequest struct {
	Username string `json:"username"`
	Email    string `json:"email"`
	Password string `json:"password"`
}

func Login(auth Authenticator) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var body loginRequest
		if err := DecodeJSON(r, &body); err != nil {
			Error(w, http.StatusBadRequest, "bad_request", "Invalid login request")
			return
		}
		user, ok := auth.ValidateCredentials(body.Email, body.Password)
		if !ok {
			Error(w, http.StatusUnauthorized, "invalid_credentials", "Invalid email or password")
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

func Register(auth Authenticator) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var body registerRequest
		if err := DecodeJSON(r, &body); err != nil {
			Error(w, http.StatusBadRequest, "bad_request", "Invalid registration request")
			return
		}
		if strings.TrimSpace(body.Username) == "" || strings.TrimSpace(body.Email) == "" || body.Password == "" {
			Error(w, http.StatusBadRequest, "bad_request", "Username, email, and password are required")
			return
		}
		user, err := auth.RegisterUser(body.Username, body.Email, body.Password)
		if err != nil {
			if strings.Contains(err.Error(), "duplicate") || strings.Contains(err.Error(), "unique") {
				Error(w, http.StatusConflict, "conflict", "Username or email already taken")
				return
			}
			Error(w, http.StatusInternalServerError, "register_failed", "Could not create account")
			return
		}

		token, err := auth.CreateSessionToken(user.ID, user.DisplayName())
		if err != nil {
			Error(w, http.StatusInternalServerError, "session_failed", "Could not create session")
			return
		}

		if r.Header.Get("X-Client") == "expo" {
			JSON(w, http.StatusCreated, map[string]any{
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
		JSON(w, http.StatusCreated, map[string]any{
			"authenticated": true,
			"user": map[string]string{
				"id":       user.ID,
				"username": user.DisplayName(),
			},
		})
	}
}

func Logout(auth Authenticator) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		auth.ClearSessionCookie(w)
		JSON(w, http.StatusOK, map[string]bool{"ok": true})
	}
}

func Session(auth Authenticator) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, username, err := auth.UserAndUsernameFromRequest(r)
		if err != nil {
			Error(w, http.StatusUnauthorized, "unauthorized", "Unauthorized")
			return
		}
		JSON(w, http.StatusOK, map[string]any{
			"authenticated": true,
			"user": map[string]string{
				"id":       userID,
				"username": username,
			},
		})
	}
}
