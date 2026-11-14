package apphttp

import (
	"encoding/base64"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"orpheus-web/internal/config"
)

func testPasskeyService(t *testing.T) *PasskeyService {
	t.Helper()
	ps, err := NewPasskeyService(config.Config{
		Domain:           "localhost",
		AuthRPOrigin:     "http://localhost:8080",
		AuthCookieSecret: "test-secret-key-at-least-32-bytes!",
	}, nil)
	if err != nil {
		t.Fatal(err)
	}
	return ps
}

func beginLoginCookie(t *testing.T, ps *PasskeyService) *http.Cookie {
	t.Helper()
	response := httptest.NewRecorder()
	if _, err := ps.BeginLogin(response, httptest.NewRequest(http.MethodPost, "/api/auth/passkey/login-begin", nil)); err != nil {
		t.Fatal(err)
	}
	for _, cookie := range response.Result().Cookies() {
		if cookie.Name == challengeCookieName {
			return cookie
		}
	}
	t.Fatal("login-begin set no challenge cookie")
	return nil
}

func requestWith(cookie *http.Cookie) *http.Request {
	request := httptest.NewRequest(http.MethodPost, "/api/auth/passkey/login-finish", nil)
	request.AddCookie(cookie)
	return request
}

func TestChallengeCookieRoundTrip(t *testing.T) {
	ps := testPasskeyService(t)
	session, err := ps.challengeSession(requestWith(beginLoginCookie(t, ps)))
	if err != nil {
		t.Fatal(err)
	}
	if session.Challenge == "" {
		t.Fatal("challenge lost in round trip")
	}
}

func TestChallengeCookieRejectsRewrittenChallenge(t *testing.T) {
	ps := testPasskeyService(t)
	cookie := beginLoginCookie(t, ps)
	issued, err := ps.challengeSession(requestWith(cookie))
	if err != nil {
		t.Fatal(err)
	}
	payload, signature, _ := strings.Cut(cookie.Value, ".")
	raw, err := base64.RawURLEncoding.DecodeString(payload)
	if err != nil {
		t.Fatal(err)
	}
	forged := strings.Replace(string(raw), issued.Challenge, "attacker-chosen-challenge", 1)
	cookie.Value = base64.RawURLEncoding.EncodeToString([]byte(forged)) + "." + signature
	if _, err := ps.challengeSession(requestWith(cookie)); err == nil {
		t.Fatal("rewritten challenge accepted")
	}
}

func TestChallengeCookieRejectsOtherSecret(t *testing.T) {
	cookie := beginLoginCookie(t, testPasskeyService(t))
	other, err := NewPasskeyService(config.Config{
		Domain:           "localhost",
		AuthRPOrigin:     "http://localhost:8080",
		AuthCookieSecret: "a-different-secret-of-32-bytes!!",
	}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := other.challengeSession(requestWith(cookie)); err == nil {
		t.Fatal("cookie signed with another secret accepted")
	}
}

func TestNewServerFailsOnInvalidPasskeyConfig(t *testing.T) {
	if _, err := NewServer(config.Config{AuthCookieSecret: "secret", Domain: "https://example.com", AuthRPOrigin: "https://example.com"}, nil, nil, nil, nil, t.TempDir()); err == nil {
		t.Fatal("server started without a valid WebAuthn relying party")
	}
}
