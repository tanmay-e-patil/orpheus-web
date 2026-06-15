# Lesson 01: What a Go Project Looks Like

This project is a Go web app. The backend code lives mostly in:

```txt
cmd/
internal/
go.mod
go.sum
```

## `go.mod`

File: [`../go.mod`](../go.mod)

```go
module orpheus-web

go 1.25.0
```

This declares the module name. Other files import project packages using this prefix:

```go
import "orpheus-web/internal/store"
```

Think of `orpheus-web` like the root package name for this app.

## `cmd/`

Go projects often put executables in `cmd/`.

This project has:

```txt
cmd/orpheus/main.go
cmd/redownload-library/main.go
```

Each executable has:

```go
package main

func main() {
    // program starts here
}
```

`cmd/orpheus/main.go` is the main web server.

## `internal/`

Go has a special rule for directories named `internal`.

Code inside `internal/` can only be imported by code inside this module. This prevents outside projects from depending on private app code.

Current packages:

```txt
internal/config     # environment variables and app configuration
internal/http       # server, auth, routing, middleware
internal/http/handlers # endpoint handlers
internal/services   # external services: YouTube, Deezer, LRCLib, RabbitMQ
internal/store      # database access
internal/types      # shared request/response/data structs
```

## Package names

Every Go file starts with a package declaration:

```go
package config
```

or:

```go
package store
```

All `.go` files in the same folder usually share the same package name.

Example:

```txt
internal/store/db.go       package store
internal/store/songs.go    package store
internal/store/users.go    package store
```

These files together form one package: `store`.

## Imports

Example from `cmd/orpheus/main.go`:

```go
import (
    "context"
    "log"
    "net/http"

    "orpheus-web/internal/config"
    "orpheus-web/internal/store"
)
```

There are two kinds of imports:

1. Standard library imports: `context`, `log`, `net/http`
2. Project imports: `orpheus-web/internal/config`

## Exported names

In Go, capitalization controls visibility.

```go
type Config struct {}
func Load() {}
```

`Config` and `Load` start with uppercase letters, so other packages can use them.

```go
func getenv() {}
```

`getenv` starts lowercase, so only the `config` package can use it.

## Mental model

This app roughly works like this:

```txt
main.go
  loads config
  opens database
  runs migrations
  builds services
  builds HTTP server
  starts listening

HTTP route
  calls handler
  handler validates request
  handler calls store/service
  handler returns JSON

store
  talks to Postgres

services
  talk to YouTube, Deezer, LRCLib, RabbitMQ
```

## Checkpoint

You should now know:

- `go.mod` defines the module
- `cmd/` contains executables
- `internal/` contains private app packages
- every file belongs to a package
- uppercase names are exported
- lowercase names are private to the package
