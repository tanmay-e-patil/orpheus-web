package apphttp

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"strings"
	"time"

	"orpheus-web/internal/config"
	"orpheus-web/internal/http/handlers"
	"orpheus-web/internal/store"
)

const nativeCallback = "orpheus://auth/callback"

type nativeGrantStore interface {
	CreateNativeLoginGrant(context.Context, []byte, []byte, string, string, time.Time, time.Time) error
	ConsumeNativeLoginGrant(context.Context, []byte, string) (string, error)
	GetUserByID(context.Context, string) (*store.User, error)
}
type nativeSessionAuth interface {
	UserAndUsernameFromRequest(*http.Request) (string, string, error)
	CreateSessionToken(string, string) (string, error)
	SetSessionCookie(http.ResponseWriter, string)
}
type nativeAuth struct {
	origin, secret string
	auth           nativeSessionAuth
	grants         nativeGrantStore
	now            func() time.Time
}
type nativeTicket struct {
	Nonce     string `json:"nonce"`
	Challenge string `json:"challenge"`
	State     string `json:"state"`
	Action    string `json:"action"`
	UserID    string `json:"userId,omitempty"`
	Name      string `json:"name,omitempty"`
	Expires   int64  `json:"expires"`
}

func newNativeAuth(cfg config.Config, auth nativeSessionAuth, grants nativeGrantStore) *nativeAuth {
	return &nativeAuth{origin: strings.TrimRight(cfg.AuthRPOrigin, "/"), secret: cfg.AuthCookieSecret, auth: auth, grants: grants, now: time.Now}
}
func nativeRandom() (string, error) {
	var b [32]byte
	_, err := rand.Read(b[:])
	return base64.RawURLEncoding.EncodeToString(b[:]), err
}
func nativeHash(value string) []byte { sum := sha256.Sum256([]byte(value)); return sum[:] }
func nativeValid32(value string) bool {
	b, err := base64.RawURLEncoding.DecodeString(value)
	return err == nil && len(b) == 32 && base64.RawURLEncoding.EncodeToString(b) == value
}
func (n *nativeAuth) sign(ticket nativeTicket) (string, error) {
	payload, err := json.Marshal(ticket)
	if err != nil {
		return "", err
	}
	encoded := base64.RawURLEncoding.EncodeToString(payload)
	mac := hmac.New(sha256.New, []byte(n.secret))
	mac.Write([]byte("orpheus-native-login-v1." + encoded))
	return encoded + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil)), nil
}
func (n *nativeAuth) ticket(value string) (nativeTicket, error) {
	var ticket nativeTicket
	if len(value) > 4096 {
		return ticket, errors.New("invalid request")
	}
	parts := strings.Split(value, ".")
	if len(parts) != 2 {
		return ticket, errors.New("invalid request")
	}
	signature, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return ticket, err
	}
	mac := hmac.New(sha256.New, []byte(n.secret))
	mac.Write([]byte("orpheus-native-login-v1." + parts[0]))
	if !hmac.Equal(signature, mac.Sum(nil)) {
		return ticket, errors.New("invalid request")
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return ticket, err
	}
	if err = json.Unmarshal(payload, &ticket); err != nil {
		return ticket, err
	}
	if ticket.Expires <= n.now().Unix() || ticket.Expires > n.now().Add(5*time.Minute).Unix() || !nativeValid32(ticket.Nonce) || !nativeValid32(ticket.Challenge) || !nativeValid32(ticket.State) || (ticket.Action != "login" && ticket.Action != "register") {
		return ticket, errors.New("expired or invalid request")
	}
	return ticket, nil
}
func (n *nativeAuth) headers(w http.ResponseWriter) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Referrer-Policy", "no-referrer")
}
func (n *nativeAuth) decode(w http.ResponseWriter, r *http.Request, dst any) bool {
	n.headers(w)
	r.Body = http.MaxBytesReader(w, r.Body, 8192)
	if !strings.HasPrefix(r.Header.Get("Content-Type"), "application/json") || handlers.DecodeJSON(r, dst) != nil {
		handlers.Error(w, 400, "bad_request", "Invalid login request")
		return false
	}
	if origin := r.Header.Get("Origin"); origin != "" && origin != n.origin {
		handlers.Error(w, 403, "invalid_origin", "Invalid login origin")
		return false
	}
	return true
}
func (n *nativeAuth) begin(w http.ResponseWriter, r *http.Request) {
	var body struct {
		CodeChallenge string `json:"codeChallenge"`
		State         string `json:"state"`
		Action        string `json:"action"`
		Name          string `json:"name"`
	}
	if !n.decode(w, r, &body) {
		return
	}
	if !nativeValid32(body.CodeChallenge) || !nativeValid32(body.State) || (body.Action != "login" && body.Action != "register") || len(body.Name) > 400 {
		handlers.Error(w, 400, "bad_request", "Invalid login request")
		return
	}
	ticket := nativeTicket{Challenge: body.CodeChallenge, State: body.State, Action: body.Action, Name: strings.TrimSpace(body.Name), Expires: n.now().Add(5 * time.Minute).Unix()}
	if body.Action == "register" {
		id, _, err := n.auth.UserAndUsernameFromRequest(r)
		if err != nil {
			handlers.Error(w, 401, "unauthorized", "Sign in before adding a passkey")
			return
		}
		ticket.UserID = id
	}
	nonce, err := nativeRandom()
	if err != nil {
		handlers.Error(w, 500, "native_login_failed", "Could not start sign-in")
		return
	}
	ticket.Nonce = nonce
	signed, err := n.sign(ticket)
	if err != nil {
		handlers.Error(w, 500, "native_login_failed", "Could not start sign-in")
		return
	}
	handlers.JSON(w, 200, map[string]string{"authorizationURL": n.origin + "/auth/native?request=" + url.QueryEscape(signed)})
}
func (n *nativeAuth) details(w http.ResponseWriter, r *http.Request) {
	n.headers(w)
	ticket, err := n.ticket(r.URL.Query().Get("request"))
	if err != nil {
		handlers.Error(w, 400, "invalid_request", "This sign-in request has expired. Return to the app and try again.")
		return
	}
	handlers.JSON(w, 200, map[string]string{"action": ticket.Action, "userId": ticket.UserID, "name": ticket.Name})
}
func (n *nativeAuth) authorize(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Request string `json:"request"`
	}
	if !n.decode(w, r, &body) {
		return
	}
	if r.Header.Get("Origin") != n.origin {
		handlers.Error(w, 403, "invalid_origin", "Invalid login origin")
		return
	}
	ticket, err := n.ticket(body.Request)
	if err != nil {
		handlers.Error(w, 400, "invalid_request", "This sign-in request has expired. Return to the app and try again.")
		return
	}
	userID, _, err := n.auth.UserAndUsernameFromRequest(r)
	if err != nil {
		handlers.Error(w, 401, "unauthorized", "Sign in to continue")
		return
	}
	if ticket.UserID != "" && ticket.UserID != userID {
		handlers.Error(w, 403, "wrong_account", "Sign in with the same account as the iOS app")
		return
	}
	code, err := nativeRandom()
	if err != nil {
		handlers.Error(w, 500, "native_login_failed", "Could not complete sign-in")
		return
	}
	if err = n.grants.CreateNativeLoginGrant(r.Context(), nativeHash(code), nativeHash(ticket.Nonce), ticket.Challenge, userID, n.now().Add(time.Minute), time.Unix(ticket.Expires, 0)); err != nil {
		handlers.Error(w, 409, "native_login_failed", "This request could not be authorized. Return to the app and try again.")
		return
	}
	callback := nativeCallback + "?" + url.Values{"code": {code}, "state": {ticket.State}}.Encode()
	handlers.JSON(w, 200, map[string]string{"callbackURL": callback})
}
func (n *nativeAuth) exchange(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Code         string `json:"code"`
		CodeVerifier string `json:"codeVerifier"`
	}
	if !n.decode(w, r, &body) {
		return
	}
	if !nativeValid32(body.Code) || !nativeValid32(body.CodeVerifier) {
		handlers.Error(w, 400, "invalid_grant", "Invalid or expired sign-in code")
		return
	}
	challenge := base64.RawURLEncoding.EncodeToString(nativeHash(body.CodeVerifier))
	userID, err := n.grants.ConsumeNativeLoginGrant(r.Context(), nativeHash(body.Code), challenge)
	if err != nil {
		handlers.Error(w, 400, "invalid_grant", "Invalid or expired sign-in code")
		return
	}
	user, err := n.grants.GetUserByID(r.Context(), userID)
	if err != nil {
		handlers.Error(w, 500, "user_not_found", "Could not load account")
		return
	}
	token, err := n.auth.CreateSessionToken(user.ID, user.DisplayName())
	if err != nil {
		handlers.Error(w, 500, "session_failed", "Could not create session")
		return
	}
	n.auth.SetSessionCookie(w, token)
	handlers.JSON(w, 200, map[string]any{"authenticated": true, "user": map[string]string{"id": user.ID, "username": user.DisplayName()}})
}
