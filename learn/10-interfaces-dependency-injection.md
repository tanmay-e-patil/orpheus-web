# Lesson 10: Interfaces and Dependency Injection

Good files:

- [`../internal/http/router.go`](../internal/http/router.go)
- [`../internal/http/middleware.go`](../internal/http/middleware.go)
- [`../internal/http/handlers/songs.go`](../internal/http/handlers/songs.go)

## Interfaces

An interface describes behavior.

The most important interface in this project is from Go's standard library:

```go
type Handler interface {
    ServeHTTP(ResponseWriter, *Request)
}
```

Anything with a `ServeHTTP` method is an `http.Handler`.

## Implicit implementation

Go does not use `implements`.

If a type has the required methods, it satisfies the interface automatically.

This is different from many languages.

## `http.HandlerFunc`

The standard library defines an adapter:

```go
type HandlerFunc func(ResponseWriter, *Request)
```

It lets ordinary functions behave like handlers.

This project uses it everywhere:

```go
return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
    ...
})
```

## Dependency injection

Dependency injection means passing dependencies in instead of creating them globally.

In [`../cmd/orpheus/main.go`](../cmd/orpheus/main.go):

```go
server := apphttp.NewServer(
    cfg,
    db,
    services.NewYouTubeClient(cfg.YouTubeAPIKey, httpClient),
    services.NewDeezerClient(httpClient),
    services.NewLRCLibClient(httpClient),
    queue,
    webDir,
)
```

The server receives everything it needs.

## Why this is good

It makes code easier to:

- test
- understand
- replace
- configure

Handlers do not need to know how to create a database. They just receive one.

## Handler injection example

Route setup:

```go
mux.Handle("GET /api/songs", s.requireAuth(method(http.MethodGet, handlers.GetSongs(s.Store, UserIDFromContext))))
```

The handler receives:

```go
handlers.GetSongs(s.Store, UserIDFromContext)
```

Inside:

```go
func GetSongs(db *store.Store, userIDFromContext func(context.Context) (string, bool)) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        userID, ok := userIDFromContext(r.Context())
        page, err := db.FetchSongsPage(...)
    }
}
```

This is dependency injection using plain functions.

## Function types as dependencies

```go
userIDFromContext func(context.Context) (string, bool)
```

This parameter is itself a function.

It accepts a context and returns:

```go
(string, bool)
```

This project passes `UserIDFromContext` into handlers instead of making handlers directly depend on auth internals.

## Interfaces vs concrete types

This project often passes concrete types:

```go
*store.Store
*services.DeezerClient
```

That is fine for app code.

If you want easier unit tests, you can introduce smaller interfaces later:

```go
type SongFetcher interface {
    FetchSongsPage(ctx context.Context, opts store.FetchSongsOptions) (types.SongsPageResponse, error)
}
```

Then handlers can accept `SongFetcher` instead of `*store.Store`.

## Checkpoint

You should now understand:

- interfaces describe behavior
- Go interfaces are implicit
- `http.Handler`
- `http.HandlerFunc`
- dependency injection by constructor
- dependency injection by handler factory
- functions can be dependencies
