package handlers

import "net/http"

type Authenticator interface {
	ValidateCredentials(username, password string) bool
	SetSessionCookie(w http.ResponseWriter, username string) error
	ClearSessionCookie(w http.ResponseWriter)
	UsernameFromRequest(r *http.Request) (string, error)
}

type loginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

func Login(auth Authenticator) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var body loginRequest
		if err := DecodeJSON(r, &body); err != nil {
			Error(w, http.StatusBadRequest, "bad_request", "Invalid login request")
			return
		}
		if !auth.ValidateCredentials(body.Username, body.Password) {
			Error(w, http.StatusUnauthorized, "invalid_credentials", "Invalid username or password")
			return
		}
		if err := auth.SetSessionCookie(w, body.Username); err != nil {
			Error(w, http.StatusInternalServerError, "session_failed", "Could not create session")
			return
		}
		JSON(w, http.StatusOK, map[string]any{
			"authenticated": true,
			"user":          map[string]string{"id": "single-user", "username": body.Username},
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
		username, err := auth.UsernameFromRequest(r)
		if err != nil {
			Error(w, http.StatusUnauthorized, "unauthorized", "Unauthorized")
			return
		}
		JSON(w, http.StatusOK, map[string]any{
			"authenticated": true,
			"user":          map[string]string{"id": "single-user", "username": username},
		})
	}
}
