# Svelte frontend migration

The application now uses Svelte 5, TypeScript, Vite, Tailwind CSS 4, and locally owned shadcn-svelte components. Frontend source lives in `frontend/`; Vite builds production assets into `web/`. Go continues serving the same routes, API endpoints, authenticated audio streams, and session cookies.

## UI

- A consistent charcoal/lavender visual system, with light and system appearance options in Settings.
- An artwork-led library with search across metadata and lyrics, sort controls, song action menus, cached loading, and incremental rendering.
- A persistent desktop player and a 66px mobile mini-player above bottom navigation. Now Playing opens a sheet containing listening controls, synced lyrics, and the queue.
- Svelte screens for login, settings/passkeys, song editing, audio-source replacement, lyrics lookup/editing/timing, and the complete add-song workflow.
- Direct Review saves, per-song retry handling, archived sessions, and Undo for discarded sessions/drafts.

## Compatibility

The existing API client, WebAuthn transport, audio playback controller, play-count tracking, IndexedDB song cache, lyric parser, and draft storage helpers are retained as shared service modules. Custom elements and manual DOM rendering are removed. The draft keys `orpheus-workflow-draft` and `orpheus-workflow-drafts` remain compatible, including legacy `/discover/commit` links.

Existing named theme presets are replaced by Dark, Light, and System. The preference is stored separately as `orpheus-appearance`; existing saved drafts and song caches are unaffected.

shadcn-svelte components were installed through its official CLI. The local state/orientation selectors are adapted to the installed Bits UI 2 attributes. See `frontend/src/lib/components/ui/README.md` and its MIT license.

## Build and development

```sh
npm ci --prefix frontend
npm run build --prefix frontend
go run ./cmd/orpheus
```

For HMR, run `npm run dev --prefix frontend` alongside Go. Vite proxies `/api` to `http://127.0.0.1:8080`; override with `API_PROXY_TARGET`. Match WebAuthn's configured origin to the browser origin when testing passkeys.

Docker uses a Node 24 build stage and copies only the compiled assets into the existing runtime image. CI installs dependencies, checks types, runs frontend tests, and builds the frontend. Air ignores the frontend directory because Vite watches it independently.

## Validation

- Svelte/TypeScript: zero errors and warnings.
- Thirteen frontend tests cover matching-cache invalidation, search ranking, lyric timing, compatible drafts, API payloads, 401 handling, direct saves, missing confirmations, partial retries, duplicate submissions, and concurrent-draft isolation.
- Go regression suite passes.
- Production Vite build passes.
- Browser review used the compiled frontend with synthetic API data, artwork, and a silent audio fixture; no production data or services were used.
- Library/player checked at 320, 390, 768, 1024, and 1440px: no horizontal overflow. Mobile and desktop player heights are 66px and 88px respectively.
- Verified playback continues while navigating to another song's editor and through the add-song flow.
- Verified the complete search → audio selection → metadata selection → lyrics selection → Review → save flow.
- Verified Now Playing tabs, synced lyric highlighting, Escape dismissal, and focus returning to the mini-player.
- Verified light appearance, password sign-in, and sign-out clearing playback.

The Docker image build could not be executed because this environment lacks Docker daemon access. Real WebAuthn ceremonies, external YouTube playback, physical-device keyboard/safe-area behavior, and production audio processing still require a configured environment. Existing playback/WebAuthn transport logic and Go contracts are preserved.

## Synthetic preview

After building, `python3 frontend/tests/preview_server.py` starts a loopback-only preview on port 8082. It serves the built frontend and in-memory sample data, with no database or API credentials. Network binding requires an explicit `--bind` argument. Temporary network previews used for review are shut down afterward.
