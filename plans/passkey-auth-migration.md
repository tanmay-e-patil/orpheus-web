# Passkey Auth Migration — Go Backend + Web & Expo Clients

## Architecture

```
┌──────────────────────────────────────────────┐
│        Go app at repo root — sole auth backend│
│                                               │
│  WebAuthn via go-webauthn library             │
│  User/credential storage in Postgres          │
│  One token format: JWT (HMAC-SHA256 signed)   │
│                                               │
│  Routes:                                      │
│    POST /api/auth/register                    │
│    POST /api/auth/login                       │
│    POST /api/auth/passkey/register-begin      │
│    POST /api/auth/passkey/register-finish     │
│    POST /api/auth/passkey/login-begin         │
│    POST /api/auth/passkey/login-finish        │
│    GET  /api/auth/session                     │
│    POST /api/auth/logout                      │
└──────────┬─────────────────────┬──────────────┘
           │                     │
    ┌──────┴──────┐       ┌──────┴─────┐
    │  Web (JS)   │       │ Expo (RN)  │
    │  cookie     │       │ Bearer hdr │
    └─────────────┘       └────────────┘
   Same token, different transport
```

**One token format (JWT) for both clients.** The current system is already base64-encoded JSON claims + HMAC signature separated by a `.` — this is essentially a hand-rolled JWT. Switching to standard JWT gives us library support, stateless verification, and no transport-based branching in auth logic.

The former Next.js app has been removed; the Go app is the sole implementation.

---

## Current State

### Go app (repository root)
- Single-user: `AUTH_USERNAME` + `AUTH_PASSWORD` env vars
- `AuthService` — HMAC-signed session cookies, 7-day TTL
- `Authenticator` interface — `ValidateCredentials`, `SetSessionCookie`, `ClearSessionCookie`, `UsernameFromRequest`
- Postgres via `pgxpool`, no user tables (credentials are env-configured)

### Expo app (`orpheus-frontend/`)
- Calls `/v1/users/login` → gets JWT, stores in `expo-secure-store`
- Sends `Authorization: Bearer <token>` on subsequent requests
- Has `AuthContext` with `onLogin(email, password)`, `onRegister(email, username, password)`
- These `/v1/users/*` routes **don't exist in the Go router yet**

### Key gap
The Go app needs to grow: user management, passkey support, and JWT issuance for the Expo app.

---

## Open Question: Single-user or Multi-user?

The Go app is currently single-user. The Expo app's auth context has `register`, `login`, `userId`, `email` — it expects multi-user.

**This plan assumes multi-user** since the Expo app already has that shape. If single-user is desired, the user table and registration routes can be simplified to a single admin setup.

---

## Phase 1 — Go Backend: Users + Passkeys

### 1.1 Add dependencies

```bash
go get github.com/go-webauthn/webauthn/webauthn
go get github.com/golang-jwt/jwt/v5
```

Replace the hand-rolled HMAC token with standard JWT.

### 1.2 Config changes — `internal/config/config.go`

```go
type Config struct {
    // Remove: AuthUsername, AuthPassword, AuthPasswordHash
    // Add:
    AuthRPOrigin     string // AUTH_RP_ORIGIN e.g. "https://orpheus.example.com"
    // Keep existing:
    AuthCookieSecret string // signs session tokens (used for both cookie and Bearer)
    Domain           string // existing — becomes WebAuthn Relying Party ID
    // ... rest unchanged
}
```

Keep `AUTH_USERNAME`/`AUTH_PASSWORD` as optional for migration period (legacy login fallback).

### 1.3 Database schema

New tables in Postgres:

```sql
CREATE TABLE users (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username   TEXT NOT NULL UNIQUE,
    email      TEXT NOT NULL UNIQUE,
    password   TEXT,                    -- nullable: null if passkey-only
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE passkeys (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    credential_id BYTEA NOT NULL UNIQUE,
    public_key    BYTEA NOT NULL,
    attestation   BYTEA,
    transport     TEXT[] NOT NULL DEFAULT '{}',
    sign_count    BIGINT NOT NULL DEFAULT 0,
    name          TEXT NOT NULL DEFAULT 'primary',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token      TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 1.4 Store layer — `internal/store/users.go`

```go
type User struct {
    ID        string
    Username  string
    Email     string
    Password  *string  // nil if passkey-only
    CreatedAt time.Time
    UpdatedAt time.Time
}

func (s *Store) CreateUser(ctx context.Context, username, email, hashedPassword string) (*User, error)
func (s *Store) GetUserByEmail(ctx context.Context, email string) (*User, error)
func (s *Store) GetUserByUsername(ctx context.Context, username string) (*User, error)
func (s *Store) GetUserByID(ctx context.Context, id string) (*User, error)
```

### 1.5 Store layer — `internal/store/passkeys.go`

```go
type Passkey struct {
    ID            string
    UserID        string
    CredentialID  []byte
    PublicKey     []byte
    Attestation   []byte
    Transport     []string
    SignCount     int64
    Name          string
}

func (s *Store) CreatePasskey(ctx context.Context, pk Passkey) error
func (s *Store) GetPasskeysByUserID(ctx context.Context, userID string) ([]Passkey, error)
func (s *Store) GetPasskeyByCredentialID(ctx context.Context, credID []byte) (*Passkey, error)
func (s *Store) UpdatePasskeySignCount(ctx context.Context, id string, signCount int64) error
func (s *Store) DeletePasskey(ctx context.Context, id string) error
```

### 1.6 Store layer — `internal/store/sessions.go`

```go
func (s *Store) CreateSession(ctx context.Context, userID string, token string, expiresAt time.Time) error
func (s *Store) GetSessionByToken(ctx context.Context, token string) (*Session, error)
func (s *Store) DeleteSession(ctx context.Context, token string) error
```

### 1.7 Passkey service — `internal/http/passkey.go`

Wraps `go-webauthn` library:

```go
type PasskeyService struct {
    webAuthn *webauthn.WebAuthn
    store    *store.Store
}

// Implements webauthn.User for the go-webauthn library
type webAuthnUser struct {
    user    *store.User
    passkeys []store.Passkey
}

func (u *webAuthnUser) WebAuthnID() []byte { ... }
func (u *webAuthnUser) WebAuthnName() string { ... }
func (u *webAuthnUser) WebAuthnDisplayName() string { ... }
func (u *webAuthnUser) WebAuthnCredentials() []webauthn.Credential { ... }
```

Key methods:
- `BeginRegistration(user)` → returns creation options JSON
- `FinishRegistration(user, request)` → validates, stores credential
- `BeginLogin()` → returns request options JSON
- `FinishLogin(request)` → validates, updates sign count

### 1.8 Challenge storage — encrypted cookie

Same approach as original plan. During `*-begin`, set a short-lived HMAC-signed cookie with the challenge. During `*-finish`, verify it. No server-side state.

### 1.9 Rewrite `AuthService` — `internal/http/auth.go`

JWT for both clients. One verification path. The only difference is transport:
- **Web:** token is set as an `HttpOnly` cookie by the server
- **Expo:** token is returned in the JSON response body, client sends it as `Authorization: Bearer <token>`

```go
type AuthService struct {
    cfg          config.Config
    store        *store.Store
    passkey      *PasskeyService
}

type SessionClaims struct {
    UserID   string `json:"user_id"`
    Username string `json:"username"`
    jwt.RegisteredClaims
}

// Issue a JWT (used for both web and Expo)
func (a *AuthService) CreateSessionToken(userID, username string) (string, error)

// Web: set JWT as HttpOnly cookie
func (a *AuthService) SetSessionCookie(w http.ResponseWriter, token string)

// Clear session cookie
func (a *AuthService) ClearSessionCookie(w http.ResponseWriter)

// Unified: extract JWT from cookie OR Authorization header, verify signature
func (a *AuthService) SessionFromRequest(r *http.Request) (*SessionClaims, error)
func (a *AuthService) UserIDFromRequest(r *http.Request) (string, error)
```

### 1.10 Updated `Authenticator` interface — `internal/http/handlers/auth.go`

```go
type Authenticator interface {
    // Password auth
    ValidateCredentials(email, password string) (*store.User, bool)
    RegisterUser(username, email, password string) (*store.User, error)

    // Session management — JWT for both clients
    CreateSessionToken(userID, username string) (string, error)
    SetSessionCookie(w http.ResponseWriter, token string)
    ClearSessionCookie(w http.ResponseWriter)
    SessionFromRequest(r *http.Request) (*SessionClaims, error)

    // Passkey auth
    HasPasskey(userID string) bool
    BeginPasskeyLogin() ([]byte, error)
    FinishPasskeyLogin(r *http.Request) (userID string, err error)
    BeginPasskeyRegistration(userID string) ([]byte, error)
    FinishPasskeyRegistration(r *http.Request) error
}
```

### 1.11 New API routes — `internal/http/router.go`

```
Public (no auth):
  POST /api/auth/register                  — email/password registration (Expo)
  POST /api/auth/login                     — email/password login → cookie (web) or JWT (Expo)
  POST /api/auth/passkey/login-begin       — start passkey ceremony
  POST /api/auth/passkey/login-finish      — complete passkey → cookie or JWT

Authenticated:
  GET  /api/auth/session                   — check current session
  POST /api/auth/logout                    — clear session
  POST /api/auth/passkey/register-begin    — start passkey enrollment
  POST /api/auth/passkey/register-finish   — complete enrollment
  GET  /api/auth/passkeys                  — list user's passkeys
  DELETE /api/auth/passkeys/{id}           — delete a passkey
```

### 1.12 Login endpoint dual-transport response

Same JWT. The handler decides transport based on the client:

- **Web browser** (default) → sets `Set-Cookie` header, returns JSON
- **Expo/mobile** (`X-Client: expo` header) → returns JWT in JSON body

```go
func Login(auth Authenticator) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        // ... validate credentials ...
        token, _ := auth.CreateSessionToken(user.ID, user.Username)

        if r.Header.Get("X-Client") == "expo" {
            JSON(w, 200, map[string]any{
                "token": token,  // Expo stores in SecureStore, sends as Bearer
                "user":  map[string]string{"id": user.ID, "username": user.Username, "email": user.Email},
            })
            return
        }
        auth.SetSessionCookie(w, token)  // Web: browser handles it
        JSON(w, 200, map[string]any{
            "authenticated": true,
            "user":          map[string]string{"id": user.ID, "username": user.Username},
        })
    }
}
```

Same dual-transport for `passkey/login-finish`.

### 1.13 Updated `requireAuth` middleware — `internal/http/middleware.go`

```go
func (s *Server) requireAuth(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        // SessionFromRequest checks cookie first, then Authorization: Bearer header
        // Same token, same HMAC verification either way
        if _, err := s.Auth.SessionFromRequest(r); err != nil {
            handlers.Error(w, 401, "unauthorized", "Unauthorized")
            return
        }
        next.ServeHTTP(w, r)
    })
}
```

`SessionFromRequest` implementation:
```go
func (a *AuthService) SessionFromRequest(r *http.Request) (*SessionClaims, error) {
    var tokenString string

    // 1. Try cookie (web)
    if cookie, err := r.Cookie(SessionCookieName); err == nil {
        tokenString = cookie.Value
    }
    // 2. Try Authorization: Bearer header (Expo)
    if tokenString == "" {
        if auth := r.Header.Get("Authorization"); strings.HasPrefix(auth, "Bearer ") {
            tokenString = strings.TrimPrefix(auth, "Bearer ")
        }
    }
    if tokenString == "" {
        return nil, errors.New("no session")
    }

    // Same JWT verification regardless of source
    token, err := jwt.ParseWithClaims(tokenString, &SessionClaims{}, func(t *jwt.Token) (any, error) {
        return []byte(a.cfg.AuthCookieSecret), nil
    })
    if err != nil || !token.Valid {
        return nil, errors.New("invalid session")
    }
    claims, ok := token.Claims.(*SessionClaims)
    if !ok {
        return nil, errors.New("invalid claims")
    }
    return claims, nil
}
```

---

## Phase 2 — Web Frontend (Vanilla JS)

### 2.1 New `web/assets/js/passkey.js`

```js
export const Passkey = {
  isSupported() {
    return !!window.PublicKeyCredential;
  },

  async register(optionsFromServer) {
    // Convert base64url strings from server to ArrayBuffers
    const creationOptions = {
      ...optionsFromServer,
      challenge: decode(optionsFromServer.challenge),
      user: {
        ...optionsFromServer.user,
        id: decode(optionsFromServer.user.id),
      },
      excludeCredentials: (optionsFromServer.excludeCredentials || []).map(c => ({
        ...c,
        id: decode(c.id),
      })),
    };
    const credential = await navigator.credentials.create({ publicKey: creationOptions });
    return {
      id: credential.id,
      rawId: encode(credential.rawId),
      response: {
        attestationObject: encode(credential.response.attestationObject),
        clientDataJSON: encode(credential.response.clientDataJSON),
      },
      type: credential.type,
    };
  },

  async authenticate(optionsFromServer) {
    const requestOptions = {
      ...optionsFromServer,
      challenge: decode(optionsFromServer.challenge),
      allowCredentials: (optionsFromServer.allowCredentials || []).map(c => ({
        ...c,
        id: decode(c.id),
      })),
    };
    const credential = await navigator.credentials.get({ publicKey: requestOptions });
    return {
      id: credential.id,
      rawId: encode(credential.rawId),
      response: {
        authenticatorData: encode(credential.response.authenticatorData),
        clientDataJSON: encode(credential.response.clientDataJSON),
        signature: encode(credential.response.signature),
        userHandle: credential.response.userHandle ? encode(credential.response.userHandle) : null,
      },
      type: credential.type,
    };
  },
};

function encode(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decode(base64url) {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64);
  return Uint8Array.from(binary, c => c.charCodeAt(0)).buffer;
}
```

### 2.2 Update `web/assets/js/api.js`

```js
// New methods
passkeyLoginBegin:  () => request("/api/auth/passkey/login-begin", { method: "POST" }),
passkeyLoginFinish: (body) => request("/api/auth/passkey/login-finish", { method: "POST", body: JSON.stringify(body) }),
passkeyRegisterBegin:  () => request("/api/auth/passkey/register-begin", { method: "POST" }),
passkeyRegisterFinish: (body) => request("/api/auth/passkey/register-finish", { method: "POST", body: JSON.stringify(body) }),
passkeyStatus: () => request("/api/auth/passkey/status"),
passkeyList:   () => request("/api/auth/passkeys"),
passkeyDelete: (id) => request(`/api/auth/passkeys/${id}`, { method: "DELETE" }),
```

### 2.3 Update `web/assets/js/components/login-page.js`

Replace username/password form with passkey-first flow:

```
┌─────────────────────────────┐
│                             │
│          Orpheus            │
│                             │
│  ┌───────────────────────┐  │
│  │  🔑 Sign in with      │  │
│  │     Passkey            │  │
│  └───────────────────────┘  │
│                             │
│  ───── or ────────────────  │
│                             │
│  Email                      │
│  [________________]        │
│  Password                   │
│  [________________]        │
│  [Login]                    │
│                             │
└─────────────────────────────┘
```

Logic:
1. Check `Passkey.isSupported()` → show/hide passkey button
2. Passkey click → call `login-begin` → `navigator.credentials.get()` → `login-finish` → session cookie set → redirect to `/home`
3. Password fallback → existing `API.login()` flow

Add `autocomplete="username webauthn"` to the email/username input — this enables conditional UI on mobile browsers (passkey autofill sheet above the keyboard).

### 2.4 Passkey registration — in home page or settings

After login, show a prompt to register a passkey:

```js
async function registerPasskey() {
  const options = await API.passkeyRegisterBegin();
  const credential = await Passkey.register(options);
  await API.passkeyRegisterFinish({ credential });
  toast("Passkey registered successfully");
}
```

### 2.5 CSS touch targets

Passkey button ≥ 48px height, 8px+ gap from other interactive elements.

---

## Phase 3 — Expo App Passkey Auth

### 3.1 The challenge

React Native has no `navigator.credentials` API. Need a native module.

**Recommended: `react-native-passkey`**
- Wraps iOS `ASAuthorizationController` (Face ID / Touch ID)
- Wraps Android `CredentialManager` (fingerprint / face / screen lock)
- Requires Expo dev build (already using `expo-dev-client`)

```bash
npx expo install react-native-passkey
```

### 3.2 iOS configuration

`app.json`:
```json
{
  "ios": {
    "associatedDomains": ["webcredentials:orpheus.example.com"]
  }
}
```

Host at `https://orpheus.example.com/.well-known/apple-app-site-association`:
```json
{
  "webcredentials": {
    "apps": ["TEAMID.com.tanmayep.orpheus"]
  }
}
```

This enables cross-platform passkeys — register on web, use on iOS, and vice versa.

### 3.3 Android configuration

Host at `https://orpheus.example.com/.well-known/assetlinks.json`:
```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": { "namespace": "android_app", "package_name": "com.tanmayep.orpheus", "sha256_cert_fingerprints": ["..."] }
}]
```

### 3.4 New `app/lib/passkey.js` — adapter

```js
import Passkey from 'react-native-passkey';
import { BASE_URL } from '../constants/strings';
import * as SecureStore from 'expo-secure-store';
import { ACCESS_TOKEN_KEY } from '../constants/strings';

function getToken() {
  return SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
}

export const PasskeyAuth = {
  async isSupported() {
    return Passkey.isSupported();
  },

  async register(name) {
    const token = await getToken();
    // 1. Get options from Go backend
    const res = await fetch(`${BASE_URL}/api/auth/passkey/register-begin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    });
    const options = await res.json();

    // 2. Native biometric prompt
    const result = await Passkey.register(options);

    // 3. Send credential to Go backend
    const finishRes = await fetch(`${BASE_URL}/api/auth/passkey/register-finish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(result),
    });
    return finishRes.json();
  },

  async authenticate() {
    // 1. Get options from Go backend
    const res = await fetch(`${BASE_URL}/api/auth/passkey/login-begin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const options = await res.json();

    // 2. Native biometric prompt
    const result = await Passkey.authenticate(options);

    // 3. Verify with Go backend — get session token back (same format as web, just in body)
    const finishRes = await fetch(`${BASE_URL}/api/auth/passkey/login-finish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Client': 'expo' },
      body: JSON.stringify(result),
    });
    return finishRes.json(); // { token: "<same HMAC-signed token>", user: {...} }
  },
};
```

### 3.5 Update `app/context/AuthContext.jsx`

```jsx
import { PasskeyAuth } from '../lib/passkey';

// Add new method
const loginWithPasskey = async () => {
  const result = await PasskeyAuth.authenticate();
  const { token, user } = result;

  await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, token);
  axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;

  setAuthState({ token, authenticated: true });
  setUser({ username: user.username, email: user.email, userId: user.id });
  return result;
};

const value = {
  onRegister: register,
  onLogin: login,
  onLoginWithPasskey: loginWithPasskey,  // ← NEW
  onLogout: logout,
  authState,
  user,
};
```

### 3.6 Update `app/(auth)/sign-in.jsx`

```jsx
const [passkeySupported, setPasskeySupported] = useState(false);

useEffect(() => {
  PasskeyAuth.isSupported().then(setPasskeySupported);
}, []);

const submitWithPasskey = async () => {
  setIsSubmitting(true);
  try {
    await onLoginWithPasskey();
    router.replace('/library');
  } catch (e) {
    Alert.alert('Error', e.message);
  } finally {
    setIsSubmitting(false);
  }
};

// JSX — add above email/password form:
{passkeySupported && (
  <CustomButton
    title="Sign in with Passkey"
    handlePress={submitWithPasskey}
    containerStyles="mt-7 mb-4"
  />
)}
```

### 3.7 Update `app/constants/strings.js`

Point to the Go backend:

```js
export const BASE_URL = "https://orpheus.example.com";  // Go app URL
export const LOGIN_API_URL = BASE_URL + "/api/auth/login";
export const SIGN_UP_API_URL = BASE_URL + "/api/auth/register";
export const ME_API_URL = BASE_URL + "/api/auth/session";
export const SONGS_API_URL = BASE_URL + "/api/songs";
```

### 3.8 Update `AuthContext.jsx` login to send `X-Client: expo`

```jsx
const result = await axios.post(LOGIN_API_URL, { email, password }, {
  headers: { 'X-Client': 'expo' },
});
// Response: { token: "...", user: { id, username, email } }
```

---

## Phase 4 — Go App Auth Middleware Update

### 4.1 Unified `requireAuth`

```go
func (s *Server) requireAuth(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        claims, err := s.Auth.SessionFromRequest(r)
        if err != nil {
            handlers.Error(w, 401, "unauthorized", "Unauthorized")
            return
        }
        ctx := context.WithValue(r.Context(), ctxKeyUserID, claims.UserID)
        next.ServeHTTP(w, r.WithContext(ctx))
    })
}
```

---

## Implementation Order (Tracer Bullet Slices)

### Slice 1 — Go backend: user management + password auth
1. Create `users`, `sessions` tables migration
2. Add `store/users.go` + `store/sessions.go`
3. Rewrite `AuthService` — same HMAC token, dual transport (cookie + Bearer)
4. Add `POST /api/auth/register` and update `POST /api/auth/login` for dual-transport response
5. Update `requireAuth` to extract token from cookie or Bearer header
6. **Test:** Register + login via curl, verify JWT and cookie both work

### Slice 2 — Go backend: passkey ceremony
1. Add `go-webauthn` dependency
2. Create `passkeys` table migration
3. Add `store/passkeys.go`
4. Implement `PasskeyService`
5. Add all passkey endpoints
6. **Test:** Full registration + login via curl + browser dev tools

### Slice 3 — Web frontend: passkey UI
1. Create `passkey.js` WebAuthn wrapper
2. Update `login-page.js` with passkey-first flow
3. Add `autocomplete="webauthn"` for conditional UI
4. Add passkey registration prompt after login
5. **Test:** Register passkey on Chrome desktop, sign in with it

### Slice 4 — Expo app: migrate to Go backend + passkeys
1. Update `strings.js` to point to Go app
2. Update `AuthContext.jsx` for new response format + `X-Client: expo` header
3. Install `react-native-passkey`
4. Create `lib/passkey.js` adapter
5. Update sign-in screen with passkey button
6. Configure iOS associated domains + Android asset links
7. **Test:** Register passkey on web, authenticate in Expo app on iOS

### Slice 5 — Cleanup
1. Make `AUTH_USERNAME`/`AUTH_PASSWORD` fully optional in Go config
2. Remove `@clerk/clerk-expo` from Expo dependencies
3. Remove unused `/v1/users/*` references
4. Add passkey management UI (list/delete passkeys)

---

## File Change Summary

### New files — Go
| File | Purpose |
|------|---------|
| `internal/store/users.go` | User CRUD |
| `internal/store/passkeys.go` | Passkey credential CRUD |
| `internal/store/sessions.go` | Session CRUD |
| `internal/http/passkey.go` | `PasskeyService` — WebAuthn ceremony logic |
| `internal/http/passkey_test.go` | Tests |
| `internal/http/handlers/passkey.go` | Passkey HTTP handlers |
| `internal/store/migrations/XXX_users_passkeys.sql` | Migration |

### New files — Expo
| File | Purpose |
|------|---------|
| `app/lib/passkey.js` | Native passkey adapter for Go backend |

### Modified files — Go
| File | Changes |
|------|---------|
| `go.mod` / `go.sum` | Add `go-webauthn`, `golang-jwt` |
| `internal/config/config.go` | Add `JWTSecret`, `AuthRPOrigin`; deprecate password env vars |
| `internal/http/auth.go` | Full rewrite: JWT generation/validation, dual session support |
| `internal/http/auth_test.go` | Update tests for new auth |
| `internal/http/handlers/auth.go` | Expand `Authenticator` interface, dual-format login response |
| `internal/http/middleware.go` | `requireAuth` accepts cookie or Bearer token |
| `internal/http/router.go` | New routes |

### Modified files — Web
| File | Changes |
|------|---------|
| `web/assets/js/passkey.js` | New WebAuthn browser wrapper |
| `web/assets/js/api.js` | Add passkey API methods |
| `web/assets/js/components/login-page.js` | Passkey-first login UI |
| `web/assets/js/components/home-page.js` | Passkey registration prompt |
| `web/assets/css/app.css` | Passkey button styles |
| `web/index.html` | `autocomplete="webauthn"` on fallback form |

### Modified files — Expo
| File | Changes |
|------|---------|
| `app/constants/strings.js` | Point to Go backend |
| `app/context/AuthContext.jsx` | JWT flow + passkey login + `X-Client: expo` |
| `app/(auth)/sign-in.jsx` | Passkey button |
| `app.json` | iOS associated domains |
| `package.json` | Add `react-native-passkey`, remove `@clerk/clerk-expo` |

---

## Security Notes

- **HTTPS required** for WebAuthn in production. `localhost` works for development.
- **RP ID** = `DOMAIN` env var. Must match exactly.
- **Attestation preference:** `none` — maximum compatibility, no hardware verification.
- **Token format:** Standard JWT (HMAC-SHA256 signed). 7-day TTL. Self-contained — no DB lookup needed for verification. Stored in `expo-secure-store` (encrypted at rest on device) for Expo, in HttpOnly cookie for web.
- **Cross-platform passkey sync:** iCloud Keychain (Apple), Google Password Manager (Android), 1Password. Users who lose all devices need a recovery mechanism.
- **Recovery:** Keep email/password as permanent fallback, or implement email-based magic links.
