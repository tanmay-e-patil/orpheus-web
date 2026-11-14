# Orpheus Go App - Copilot Instructions

## Project Overview

Orpheus is a music library/player application implemented as a Go HTTP server with a Svelte 5 + TypeScript frontend in `frontend/`, compiled by Vite into `web/`.

## Architecture

- `cmd/orpheus`: main web server entrypoint.
- `cmd/redownload-library`: CLI for republishing existing songs to RabbitMQ.
- `internal/http`: router, middleware, auth, passkey, and request handlers.
- `internal/services`: external integrations for YouTube, Deezer, LRCLIB, matching, and queue publishing.
- `internal/store`: PostgreSQL persistence.
- `internal/types`: shared domain/request/response types.
- `frontend/`: Svelte screens, Tailwind 4 styling, shadcn-svelte components, shared playback/API services, and frontend tests.
- `web/`: generated production assets served by Go; run the frontend build before starting Go.

## Development

```sh
bun install --cwd frontend --frozen-lockfile
bun run --cwd frontend build
go run ./cmd/orpheus
go test ./...
bun run --cwd frontend check
bun run --cwd frontend test
```

Required runtime environment is documented in `README.md`.

## Conventions

- Keep server code in `internal/` packages; add new binaries under `cmd/`.
- Keep browser source in `frontend/src`; use Svelte 5 with TypeScript and the local shadcn-svelte components. Do not edit generated `web/` files.
- Keep API contracts and existing draft storage keys compatible. Playback must remain mounted across route changes.
- Use context-aware database calls and return structured JSON errors from HTTP handlers.
- Use Bun for every frontend package and script command. Never run npm, npx, yarn, or pnpm; `frontend/package.json` blocks installs from other package managers. Do not reintroduce Next.js or React tooling.
