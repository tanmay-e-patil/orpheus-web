# Lesson 05: HTTP Servers, Handlers, and Middleware

Good files:

- [`../internal/http/router.go`](../internal/http/router.go)
- [`../internal/http/middleware.go`](../internal/http/middleware.go)
- [`../internal/http/handlers/songs.go`](../internal/http/handlers/songs.go)

## The HTTP server

In [`../cmd/orpheus/main.go`](../cmd/orpheus/main.go):

```go
httpServer := &http.Server{
    Addr:              ":" + cfg.Port,
    Handler:           server.Routes(),
    ReadHeaderTimeout: 5 * time.Second,
}
```

The most important field is:

```go
Handler: server.Routes()
```

A handler receives HTTP requests.

## `http.Handler`

In Go's standard library, an HTTP handler is anything with this method:

```go
ServeHTTP(http.ResponseWriter, *http.Request)
```

Function handlers are commonly written as:

```go
func(w http.ResponseWriter, r *http.Request) {
    ...
}
```

## Router

In [`../internal/http/router.go`](../internal/http/router.go):

```go
func (s *Server) Routes() http.Handler {
    mux := http.NewServeMux()
```

`http.NewServeMux()` creates a request multiplexer: a router.

Routes are registered like:

```go
mux.Handle("GET /healthz", method(http.MethodGet, handlers.Health))
```

This means:

```txt
GET /healthz -> handlers.Health
```

## Server struct

```go
type Server struct {
    Config  config.Config
    Store   *store.Store
    Auth    *AuthService
    YouTube *services.YouTubeClient
    Deezer  *services.DeezerClient
    LRCLib  *services.LRCLibClient
    Queue   *services.QueuePublisher
    WebDir  string
}
```

The server holds dependencies needed by routes.

## Handler factories

In [`../internal/http/handlers/songs.go`](../internal/http/handlers/songs.go):

```go
func GetSongs(db *store.Store, userIDFromContext func(context.Context) (string, bool)) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        ...
    }
}
```

This function returns another function.

Why? To inject dependencies:

```go
handlers.GetSongs(s.Store, UserIDFromContext)
```

The returned function has access to `db` and `userIDFromContext` through a closure.

## Closures

A closure is a function that remembers variables from the surrounding scope.

Example:

```go
func sayLater(message string) func() {
    return func() {
        fmt.Println(message)
    }
}
```

The inner function remembers `message`.

This project uses that pattern for handlers.

## Middleware

Middleware wraps handlers.

In [`../internal/http/middleware.go`](../internal/http/middleware.go):

```go
func method(method string, next http.HandlerFunc) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        if r.Method != method {
            w.Header().Set("Allow", method)
            handlers.Error(w, http.StatusMethodNotAllowed, "method_not_allowed", "Method not allowed")
            return
        }
        next(w, r)
    })
}
```

This middleware checks the HTTP method before calling the real handler.

## Auth middleware

```go
func (s *Server) requireAuth(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        claims, err := s.Auth.SessionFromRequest(r)
        if err != nil {
            handlers.Error(w, http.StatusUnauthorized, "unauthorized", "Unauthorized")
            return
        }
        ctx := context.WithValue(r.Context(), userIDCtxKey, claims.UserID)
        next.ServeHTTP(w, r.WithContext(ctx))
    })
}
```

This middleware:

1. Checks the session
2. Returns 401 if missing/invalid
3. Stores user ID in request context
4. Calls the next handler

## Request and response objects

```go
w http.ResponseWriter
r *http.Request
```

`w` writes the response.

`r` contains request data:

```go
r.Method
r.URL.Path
r.URL.Query()
r.Body
r.Context()
r.PathValue("trackId")
```

## Path params

Route:

```go
mux.Handle("POST /api/songs/{trackId}/plays", ...)
```

Handler:

```go
trackID := r.PathValue("trackId")
```

## Checkpoint

You should now understand:

- `http.Server`
- `http.Handler`
- `http.HandlerFunc`
- routes
- handlers
- middleware
- closures
- path params
