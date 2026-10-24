package apphttp

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"testing"
	"time"

	"orpheus-web/internal/config"
	"orpheus-web/internal/store"
)

type nativeAuthFake struct{}

func (nativeAuthFake) UserAndUsernameFromRequest(r *http.Request) (string, string, error) {
	c, err := r.Cookie("browser_session")
	if err != nil {
		return "", "", err
	}
	return c.Value, c.Value, nil
}
func (nativeAuthFake) CreateSessionToken(id, name string) (string, error) { return "native-" + id, nil }
func (nativeAuthFake) SetSessionCookie(w http.ResponseWriter, token string) {
	http.SetCookie(w, &http.Cookie{Name: "orpheus_session", Value: token, HttpOnly: true, Secure: true, Path: "/"})
}

type fakeNativeGrant struct {
	challenge, user string
	expires         time.Time
	consumed        bool
}
type nativeGrantFake struct {
	sync.Mutex
	codes    map[string]fakeNativeGrant
	requests map[string]bool
	now      func() time.Time
}

func (f *nativeGrantFake) CreateNativeLoginGrant(_ context.Context, code, request []byte, challenge, user string, expiry, requestExpiry time.Time) error {
	f.Lock()
	defer f.Unlock()
	if f.requests[string(request)] {
		return errors.New("request replay")
	}
	f.requests[string(request)] = true
	f.codes[string(code)] = fakeNativeGrant{challenge: challenge, user: user, expires: expiry}
	return nil
}
func (f *nativeGrantFake) ConsumeNativeLoginGrant(_ context.Context, code []byte, challenge string) (string, error) {
	f.Lock()
	defer f.Unlock()
	grant, ok := f.codes[string(code)]
	if !ok || grant.consumed || grant.challenge != challenge || !grant.expires.After(f.now()) {
		return "", errors.New("invalid grant")
	}
	grant.consumed = true
	f.codes[string(code)] = grant
	return grant.user, nil
}
func (f *nativeGrantFake) GetUserByID(_ context.Context, id string) (*store.User, error) {
	return &store.User{ID: id, Name: id, Email: id + "@example.com"}, nil
}
func nativeTestHandler() (*nativeAuth, *time.Time) {
	now := time.Now().Truncate(time.Second)
	clock := func() time.Time { return now }
	grants := &nativeGrantFake{codes: map[string]fakeNativeGrant{}, requests: map[string]bool{}, now: clock}
	n := newNativeAuth(config.Config{AuthRPOrigin: "https://music.example.com", AuthCookieSecret: "test-secret"}, nativeAuthFake{}, grants)
	n.now = clock
	return n, &now
}
func nativeRequest(handler http.HandlerFunc, method, path, body, origin, user string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(method, path, strings.NewReader(body))
	r.Header.Set("Content-Type", "application/json")
	if origin != "" {
		r.Header.Set("Origin", origin)
	}
	if user != "" {
		r.AddCookie(&http.Cookie{Name: "browser_session", Value: user})
	}
	w := httptest.NewRecorder()
	handler(w, r)
	return w
}
func nativeTestBegin(t *testing.T, n *nativeAuth, action, user string) (string, string, string) {
	t.Helper()
	verifier, _ := nativeRandom()
	state, _ := nativeRandom()
	challenge := base64.RawURLEncoding.EncodeToString(nativeHash(verifier))
	body, _ := json.Marshal(map[string]string{"codeChallenge": challenge, "state": state, "action": action, "name": "My iPhone"})
	w := nativeRequest(n.begin, "POST", "/api/auth/native/begin", string(body), "", user)
	if w.Code != 200 {
		t.Fatalf("begin: %d %s", w.Code, w.Body)
	}
	var result map[string]string
	json.Unmarshal(w.Body.Bytes(), &result)
	u, _ := url.Parse(result["authorizationURL"])
	if u.Host != "music.example.com" || u.Path != "/auth/native" {
		t.Fatal(u)
	}
	return u.Query().Get("request"), verifier, state
}
func nativeTestAuthorize(t *testing.T, n *nativeAuth, ticket, user string) (string, string) {
	t.Helper()
	body, _ := json.Marshal(map[string]string{"request": ticket})
	w := nativeRequest(n.authorize, "POST", "/api/auth/native/authorize", string(body), n.origin, user)
	if w.Code != 200 {
		t.Fatalf("authorize: %d %s", w.Code, w.Body)
	}
	var result map[string]string
	json.Unmarshal(w.Body.Bytes(), &result)
	u, _ := url.Parse(result["callbackURL"])
	if u.Scheme != "orpheus" || u.Host != "auth" || u.Path != "/callback" {
		t.Fatal(u)
	}
	return u.Query().Get("code"), u.Query().Get("state")
}
func nativeTestExchange(n *nativeAuth, code, verifier string) *httptest.ResponseRecorder {
	body, _ := json.Marshal(map[string]string{"code": code, "codeVerifier": verifier})
	return nativeRequest(n.exchange, "POST", "/api/auth/native/exchange", string(body), "", "")
}
func TestNativeLoginPKCEAndSingleUse(t *testing.T) {
	n, _ := nativeTestHandler()
	ticket, verifier, state := nativeTestBegin(t, n, "login", "")
	code, gotState := nativeTestAuthorize(t, n, ticket, "alice")
	if gotState != state {
		t.Fatal("state was not preserved")
	}
	wrong, _ := nativeRandom()
	if w := nativeTestExchange(n, code, wrong); w.Code != 400 {
		t.Fatal("wrong verifier accepted")
	}
	w := nativeTestExchange(n, code, verifier)
	if w.Code != 200 {
		t.Fatalf("exchange: %d %s", w.Code, w.Body)
	}
	cookies := w.Result().Cookies()
	if len(cookies) != 1 || cookies[0].Name != "orpheus_session" || !cookies[0].Secure || !cookies[0].HttpOnly {
		t.Fatal("missing secure native session")
	}
	if strings.Contains(code, "native-alice") {
		t.Fatal("callback exposed session token")
	}
	if w := nativeTestExchange(n, code, verifier); w.Code != 400 {
		t.Fatal("code replay accepted")
	}
	body, _ := json.Marshal(map[string]string{"request": ticket})
	if w := nativeRequest(n.authorize, "POST", "/authorize", string(body), n.origin, "alice"); w.Code != 409 {
		t.Fatal("request replay accepted")
	}
}
func TestNativeLoginRejectsCSRFAndUnauthenticatedAuthorization(t *testing.T) {
	n, _ := nativeTestHandler()
	ticket, _, _ := nativeTestBegin(t, n, "login", "")
	body, _ := json.Marshal(map[string]string{"request": ticket})
	for _, origin := range []string{"", "https://evil.example"} {
		if w := nativeRequest(n.authorize, "POST", "/authorize", string(body), origin, "alice"); w.Code != 403 {
			t.Fatalf("origin %q accepted", origin)
		}
	}
	if w := nativeRequest(n.authorize, "POST", "/authorize", string(body), n.origin, ""); w.Code != 401 {
		t.Fatal("anonymous authorization accepted")
	}
}
func TestNativePasskeyRegistrationBindsAccount(t *testing.T) {
	n, _ := nativeTestHandler()
	ticket, _, _ := nativeTestBegin(t, n, "register", "alice")
	body, _ := json.Marshal(map[string]string{"request": ticket})
	if w := nativeRequest(n.authorize, "POST", "/authorize", string(body), n.origin, "bob"); w.Code != 403 {
		t.Fatal("wrong browser account accepted")
	}
	nativeTestAuthorize(t, n, ticket, "alice")
}
func TestNativeLoginExpiryAndTamper(t *testing.T) {
	n, now := nativeTestHandler()
	ticket, _, _ := nativeTestBegin(t, n, "login", "")
	if _, err := n.ticket(ticket + "x"); err == nil {
		t.Fatal("tampered ticket accepted")
	}
	*now = now.Add(5 * time.Minute)
	if _, err := n.ticket(ticket); err == nil {
		t.Fatal("expired request accepted")
	}
	ticket, verifier, _ := nativeTestBegin(t, n, "login", "")
	code, _ := nativeTestAuthorize(t, n, ticket, "alice")
	*now = now.Add(time.Minute)
	if w := nativeTestExchange(n, code, verifier); w.Code != 400 {
		t.Fatal("expired code accepted")
	}
}
func TestNativeLoginRejectsUnboundRequests(t *testing.T) {
	n, _ := nativeTestHandler()
	state, _ := nativeRandom()
	for _, body := range []string{`{"codeChallenge":"short","state":"` + state + `","action":"login"}`, `{"codeChallenge":"` + state + `","state":"` + state + `","action":"login","redirectURI":"https://evil.example"}`, `{"codeChallenge":"` + state + `","state":"` + state + `","action":"register"}`} {
		w := nativeRequest(n.begin, "POST", "/begin", body, "", "")
		if w.Code == 200 {
			t.Fatal("invalid request accepted")
		}
	}
}
