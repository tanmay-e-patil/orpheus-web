# Lesson 02: The App Entrypoint, Line by Line

File: [`../cmd/orpheus/main.go`](../cmd/orpheus/main.go)

This file starts the web app.

## Package declaration

```go
package main
```

A Go executable must use `package main` and define `func main()`.

## Imports

```go
import (
    "context"
    "errors"
    "log"
    "net/http"
    "os"
    "os/signal"
    "path/filepath"
    "syscall"
    "time"

    apphttp "orpheus-web/internal/http"

    "orpheus-web/internal/config"
    "orpheus-web/internal/services"
    "orpheus-web/internal/store"
)
```

The standard library gives us packages like:

- `context`: cancellation and timeouts
- `errors`: error comparison
- `log`: logging
- `net/http`: HTTP server/client
- `os`: environment/process tools
- `time`: durations and clocks

This import has an alias:

```go
apphttp "orpheus-web/internal/http"
```

The folder is named `http`, but Go already has standard `net/http`. The alias `apphttp` avoids confusion.

## `func main()`

```go
func main() {
```

This is where the program starts.

## Context for shutdown

```go
ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
defer stop()
```

This creates a `context.Context` that is canceled when the process receives:

- Ctrl-C / interrupt
- SIGTERM from Docker/system process manager

`:=` declares and assigns variables.

```go
ctx, stop := ...
```

means:

- create variable `ctx`
- create variable `stop`
- assign returned values

`defer stop()` means call `stop()` when `main` exits.

## Load config

```go
cfg, err := config.Load()
if err != nil {
    log.Fatalf("config: %v", err)
}
```

Go uses explicit error handling. `config.Load()` returns two values:

```go
(Config, error)
```

If `err` is not `nil`, something failed.

`nil` means “no value” for pointers, interfaces, maps, slices, channels, and function values.

## Open database

```go
db, err := store.Open(ctx, cfg.DatabaseURL)
if err != nil {
    log.Fatalf("database: %v", err)
}
defer db.Close()
```

This opens a Postgres connection pool.

`defer db.Close()` guarantees the pool is closed when `main` exits.

## Run migrations

```go
if err := db.MigrateUp(ctx); err != nil {
    log.Fatalf("migrations: %v", err)
}
```

This is a common compact Go pattern:

```go
if err := doThing(); err != nil {
    handleError(err)
}
```

The `err` variable exists only inside the `if` statement.

## Build an HTTP client

```go
httpClient := &http.Client{Timeout: cfg.HTTPTimeout}
```

`&` means “take the address of this value.”

This creates a pointer to an `http.Client`.

Why a pointer? Because clients are meant to be reused and can have internal state.

## Build a queue publisher

```go
queue := services.NewQueuePublisher(cfg.RabbitMQURL)
defer queue.Close()
```

This constructs a service used later by request handlers.

## Build server dependencies

```go
webDir := filepath.Join("web")
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

`NewServer` receives dependencies:

- config
- database
- YouTube client
- Deezer client
- LRCLib client
- queue publisher
- web directory

This is dependency injection without a framework.

## Configure HTTP server

```go
httpServer := &http.Server{
    Addr:              ":" + cfg.Port,
    Handler:           server.Routes(),
    ReadHeaderTimeout: 5 * time.Second,
}
```

This is a struct literal.

`Addr` might become `":8080"`.

`Handler` is what receives HTTP requests.

## Start server in background

```go
go func() {
    log.Printf("Orpheus Go app listening on http://localhost:%s", cfg.Port)
    if err := httpServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
        log.Fatalf("server: %v", err)
    }
}()
```

`go` starts a goroutine: a lightweight concurrent task.

This anonymous function runs in the background while `main` continues.

The app ignores `http.ErrServerClosed` because that happens during normal shutdown.

## Wait for shutdown

```go
<-ctx.Done()
```

This waits until the context is canceled.

The `<-` operator receives from a channel. `ctx.Done()` returns a channel that closes on cancellation.

## Graceful shutdown

```go
shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
defer cancel()
if err := httpServer.Shutdown(shutdownCtx); err != nil {
    log.Printf("shutdown: %v", err)
}
```

This gives the server 10 seconds to finish active requests.

## Full lifecycle

```txt
start
  create shutdown context
  load config
  open database
  run migrations
  create services
  create HTTP server
  start HTTP server in goroutine
  wait for signal
  gracefully shut down
exit
```

## Checkpoint

You have seen:

- `package main`
- imports
- `func main()`
- `:=`
- error handling
- `defer`
- pointers with `&`
- struct literals
- goroutines
- context cancellation
