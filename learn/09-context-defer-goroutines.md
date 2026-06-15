# Lesson 09: Context, Defer, Goroutines, and Shutdown

Good files:

- [`../cmd/orpheus/main.go`](../cmd/orpheus/main.go)
- [`../internal/store/db.go`](../internal/store/db.go)
- [`../internal/services/queue.go`](../internal/services/queue.go)

## Context

`context.Context` carries cancellation and deadlines.

In `main.go`:

```go
ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
defer stop()
```

This context is canceled when the app should stop.

Database calls receive context:

```go
store.Open(ctx, cfg.DatabaseURL)
db.MigrateUp(ctx)
s.Pool.Query(ctx, query, args...)
```

HTTP requests also have contexts:

```go
r.Context()
```

## Why context matters

If a user disconnects or the server shuts down, context cancellation tells operations to stop.

This avoids wasted work.

## Defer

`defer` runs a function when the current function returns.

Examples:

```go
defer db.Close()
defer queue.Close()
defer rows.Close()
defer cancel()
```

This is common for cleanup.

## Defer order

Deferred calls run in last-in, first-out order.

```go
defer fmt.Println("first")
defer fmt.Println("second")
```

Output:

```txt
second
first
```

## Goroutines

A goroutine is a lightweight concurrent task.

```go
go func() {
    httpServer.ListenAndServe()
}()
```

This starts the HTTP server in the background.

The main goroutine then waits:

```go
<-ctx.Done()
```

## Channels

`ctx.Done()` returns a channel.

```go
<-ctx.Done()
```

This waits until the channel is closed or receives a value.

You do not need to master channels yet. For now, read this as:

```txt
wait until context is canceled
```

## Graceful shutdown

```go
shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
defer cancel()
if err := httpServer.Shutdown(shutdownCtx); err != nil {
    log.Printf("shutdown: %v", err)
}
```

This gives current HTTP requests up to 10 seconds to finish.

## Context values

In [`../internal/http/middleware.go`](../internal/http/middleware.go):

```go
ctx := context.WithValue(r.Context(), userIDCtxKey, claims.UserID)
next.ServeHTTP(w, r.WithContext(ctx))
```

This stores the user ID in the request context.

Later, handlers retrieve it.

Use context values sparingly. They are useful for request-scoped data like auth claims.

## Checkpoint

You should now understand:

- context cancellation
- request contexts
- `defer`
- goroutines
- basic channel receive syntax
- graceful shutdown
