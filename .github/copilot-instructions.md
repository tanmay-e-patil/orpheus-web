# Orpheus Go App - Copilot Instructions

## Project Overview

Orpheus is a music library/player application implemented as a Go HTTP server with a static browser-native JavaScript frontend in `web/`.

## Architecture

- `cmd/orpheus`: main web server entrypoint.
- `cmd/redownload-library`: CLI for republishing existing songs to RabbitMQ.
- `internal/http`: router, middleware, auth, passkey, and request handlers.
- `internal/services`: external integrations for YouTube, Deezer, LRCLIB, matching, and queue publishing.
- `internal/store`: PostgreSQL persistence.
- `internal/types`: shared domain/request/response types.
- `web/`: static HTML, CSS, manifest, and JavaScript assets served by the Go app.

## Development

```sh
go run ./cmd/orpheus
go test ./...
find web/assets/js -name '*.js' -print -exec node --check {} \;
```

Required runtime environment is documented in `README.md`.

## Conventions

- Keep server code in `internal/` packages; add new binaries under `cmd/`.
- Keep browser code framework-free and organized under `web/assets/js` and `web/assets/css`.
- Use context-aware database calls and return structured JSON errors from HTTP handlers.
- Do not reintroduce Next.js/Bun/React tooling.
