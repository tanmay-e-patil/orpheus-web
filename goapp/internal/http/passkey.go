package apphttp

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/go-webauthn/webauthn/protocol"
	"github.com/go-webauthn/webauthn/webauthn"

	"orpheus-goapp/internal/config"
	"orpheus-goapp/internal/store"
)

const challengeCookieName = "orpheus_passkey_challenge"

type PasskeyService struct {
	webAuthn *webauthn.WebAuthn
	store    *store.Store
}

type webAuthnUser struct {
	user     *store.User
	passkeys []store.Passkey
}

func (u *webAuthnUser) WebAuthnID() []byte {
	return []byte(u.user.ID)
}

func (u *webAuthnUser) WebAuthnName() string {
	return u.user.DisplayName()
}

func (u *webAuthnUser) WebAuthnDisplayName() string {
	return u.user.DisplayName()
}

func (u *webAuthnUser) WebAuthnCredentials() []webauthn.Credential {
	creds := make([]webauthn.Credential, 0, len(u.passkeys))
	for _, pk := range u.passkeys {
		transports := make([]protocol.AuthenticatorTransport, 0, len(pk.Transport))
		for _, t := range pk.Transport {
			transports = append(transports, protocol.AuthenticatorTransport(t))
		}
		flags := protocol.AuthenticatorFlags(0)
		if pk.BackupEligible {
			flags |= protocol.FlagBackupEligible
		}
		if pk.BackupState {
			flags |= protocol.FlagBackupState
		}

		creds = append(creds, webauthn.Credential{
			ID:              pk.CredentialID,
			PublicKey:       pk.PublicKey,
			AttestationType: "none",
			Transport:       transports,
			Flags:           webauthn.NewCredentialFlags(flags),
			Authenticator: webauthn.Authenticator{
				AAGUID:    pk.AAGUID,
				SignCount: uint32(pk.SignCount),
			},
		})
	}
	return creds
}

func NewPasskeyService(cfg config.Config, db *store.Store) (*PasskeyService, error) {
	wconfig := &webauthn.Config{
		RPDisplayName: "Orpheus",
		RPID:          cfg.Domain,
		RPOrigins:     []string{cfg.AuthRPOrigin},
	}
	wa, err := webauthn.New(wconfig)
	if err != nil {
		return nil, fmt.Errorf("webauthn init: %w", err)
	}
	return &PasskeyService{webAuthn: wa, store: db}, nil
}

func (ps *PasskeyService) getWebAuthnUser(ctx context.Context, userID string) (*webAuthnUser, error) {
	user, err := ps.store.GetUserByID(ctx, userID)
	if err != nil {
		return nil, err
	}
	pks, err := ps.store.GetPasskeysByUserID(ctx, userID)
	if err != nil {
		return nil, err
	}
	return &webAuthnUser{user: user, passkeys: pks}, nil
}

// BeginRegistration starts the WebAuthn credential creation ceremony.
func (ps *PasskeyService) BeginRegistration(w http.ResponseWriter, r *http.Request, userID string) (json.RawMessage, error) {
	ctx := r.Context()
	waUser, err := ps.getWebAuthnUser(ctx, userID)
	if err != nil {
		return nil, err
	}

	options, session, err := ps.webAuthn.BeginRegistration(
		waUser,
		webauthn.WithAuthenticatorSelection(protocol.AuthenticatorSelection{
			// Do not set AuthenticatorAttachment. Leaving it empty lets the browser/OS
			// offer the user's available passkey providers instead of forcing the
			// platform keychain.
			ResidentKey:        protocol.ResidentKeyRequirementRequired,
			RequireResidentKey: protocol.ResidentKeyRequired(),
			UserVerification:   protocol.VerificationPreferred,
		}),
		webauthn.WithPublicKeyCredentialHints([]protocol.PublicKeyCredentialHints{
			protocol.PublicKeyCredentialHintClientDevice,
			protocol.PublicKeyCredentialHintHybrid,
			protocol.PublicKeyCredentialHintSecurityKey,
		}),
	)
	if err != nil {
		return nil, err
	}

	if err := setChallengeCookie(w, session); err != nil {
		return nil, err
	}

	return json.Marshal(options)
}

// FinishRegistration completes the credential creation ceremony.
func (ps *PasskeyService) FinishRegistration(w http.ResponseWriter, r *http.Request, userID string, name string) error {
	ctx := r.Context()
	waUser, err := ps.getWebAuthnUser(ctx, userID)
	if err != nil {
		return err
	}

	session, err := getChallengeCookie(r)
	if err != nil {
		return err
	}

	credential, err := ps.webAuthn.FinishRegistration(waUser, *session, r)
	if err != nil {
		return err
	}

	clearChallengeCookie(w)

	transports := make([]string, 0, len(credential.Transport))
	for _, t := range credential.Transport {
		transports = append(transports, string(t))
	}

	name = strings.TrimSpace(name)
	if name == "" {
		name = "Passkey"
	}

	pk := store.Passkey{
		UserID:         userID,
		CredentialID:   credential.ID,
		PublicKey:      credential.PublicKey,
		Transport:      transports,
		SignCount:      int64(credential.Authenticator.SignCount),
		Name:           name,
		AAGUID:         credential.Authenticator.AAGUID,
		BackupEligible: credential.Flags.BackupEligible,
		BackupState:    credential.Flags.BackupState,
	}

	return ps.store.CreatePasskey(ctx, pk)
}

// BeginLogin starts the WebAuthn authentication ceremony (discoverable).
func (ps *PasskeyService) BeginLogin(w http.ResponseWriter, r *http.Request) (json.RawMessage, error) {
	options, session, err := ps.webAuthn.BeginDiscoverableLogin()
	if err != nil {
		return nil, err
	}

	if err := setChallengeCookie(w, session); err != nil {
		return nil, err
	}

	return json.Marshal(options)
}

// FinishLogin completes the authentication ceremony.
// Returns the authenticated user's ID.
func (ps *PasskeyService) FinishLogin(w http.ResponseWriter, r *http.Request) (string, error) {
	session, err := getChallengeCookie(r)
	if err != nil {
		return "", err
	}

	var userID string
	credential, err := ps.webAuthn.FinishDiscoverableLogin(
		func(rawID, userHandle []byte) (webauthn.User, error) {
			ctx := r.Context()
			pk, err := ps.store.GetPasskeyByCredentialID(ctx, rawID)
			if err != nil {
				return nil, err
			}
			userID = pk.UserID
			return ps.getWebAuthnUser(ctx, pk.UserID)
		},
		*session,
		r,
	)
	if err != nil {
		return "", err
	}

	clearChallengeCookie(w)

	// Update mutable credential usage state.
	ctx := r.Context()
	pk, err := ps.store.GetPasskeyByCredentialID(ctx, credential.ID)
	if err != nil {
		return userID, nil // non-fatal
	}
	_ = ps.store.UpdatePasskeyUsage(ctx, pk.ID, int64(credential.Authenticator.SignCount), credential.Flags.BackupState)

	return userID, nil
}

// --- Challenge cookie helpers ---

func setChallengeCookie(w http.ResponseWriter, session *webauthn.SessionData) error {
	data, err := json.Marshal(session)
	if err != nil {
		return err
	}
	nonce := make([]byte, 12)
	if _, err := rand.Read(nonce); err != nil {
		return err
	}
	encoded := base64.RawURLEncoding.EncodeToString(append(nonce, data...))
	http.SetCookie(w, &http.Cookie{
		Name:     challengeCookieName,
		Value:    encoded,
		Path:     "/",
		MaxAge:   120, // 2 minutes
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteLaxMode,
	})
	return nil
}

func getChallengeCookie(r *http.Request) (*webauthn.SessionData, error) {
	cookie, err := r.Cookie(challengeCookieName)
	if err != nil {
		return nil, err
	}
	data, err := base64.RawURLEncoding.DecodeString(cookie.Value)
	if err != nil {
		return nil, err
	}
	if len(data) < 12 {
		return nil, fmt.Errorf("challenge cookie too short")
	}
	var session webauthn.SessionData
	if err := json.Unmarshal(data[12:], &session); err != nil {
		return nil, err
	}
	return &session, nil
}

func clearChallengeCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     challengeCookieName,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteLaxMode,
	})
}
