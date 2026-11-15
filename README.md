# Orpheus

Orpheus is a self-hosted music library. You search for a song by title and artist. Orpheus picks an audio source on YouTube, matches the song info on Deezer, and finds synced lyrics on LRCLib. You review the match and save it. A separate worker, `orpheus-consumer`, downloads the audio into your music folder, and Orpheus streams it back to any browser with lock-screen controls and synced lyrics.

![Orpheus demo: play a song with synced lyrics, then add a new song](docs/media/demo.gif)

[Watch the demo as MP4](docs/media/demo.mp4). The screenshots and the demo use the synthetic preview data from `frontend/tests/preview_server.py`.

| Library and player | Synced lyrics |
| --- | --- |
| ![Library with the docked player](docs/media/library.png) | ![Synced lyrics highlight the current line](docs/media/lyrics.png) |

| Add a song | Phone |
| --- | --- |
| ![Review the matched song info, audio source, and lyrics before saving](docs/media/add-song.png) | ![Library on a phone](docs/media/mobile-library.png) ![Now Playing on a phone](docs/media/mobile-now-playing.png) |

## What it does

- **Library.** Search across titles, artists, albums, and lyrics. Sort by recently added, artist, or most played.
- **Player.** One audio element stays mounted across pages. It prefetches the next song and fills in the Media Session, so lock-screen controls work on phones.
- **Lyrics.** Synced lyrics follow playback. Tap a line to seek to it.
- **Add songs.** One search opens a review page with the song info, the audio source, and the lyrics. You can change any of them before you save. Drafts persist in the browser.
- **Edit and delete.** Fix the song info, the lyrics timing, or the audio source of a saved song. Deleting a song removes it for everyone and cleans up its files.
- **Sign-in.** Username and password, or passkeys. The iOS app signs in with the same passkeys.

## How it fits together

```mermaid
flowchart LR
    Browser[Browser\nSvelte 5] -->|HTTP / JSON| App[Orpheus Web\nGo HTTP server]
    App -->|queries and migrations| DB[(PostgreSQL)]
    App -->|search and metadata| APIs[YouTube · Deezer · LRCLib]
    DB -->|NOTIFY wakes dispatcher| Dispatcher[Outbox dispatcher]
    Dispatcher -->|confirmed publication| Queue[(RabbitMQ)]
    Queue --> Consumer[orpheus-consumer]
    Consumer -->|writes audio| Music[(Shared music library)]
    Consumer -->|marks available| DB
    App -->|streams .m4a| Music
```

Song changes and their download jobs commit in one PostgreSQL transaction, so a RabbitMQ outage never loses a job. Orpheus and `orpheus-consumer` must share the same database and the same music folder. [Operations](docs/operations.md) covers the job pipeline in detail.

| Path | Contents |
| --- | --- |
| `cmd/orpheus` | The web server. |
| `cmd/redownload-library` | A CLI that queues existing songs for download again. |
| `internal/http` | The router, middleware, auth, passkeys, and request handlers. |
| `internal/services` | YouTube, Deezer, LRCLib, song matching, and the outbox dispatcher. |
| `internal/store` | PostgreSQL queries, migrations, and the in-memory library cache. |
| `frontend/` | The Svelte 5 + TypeScript app (Vite, Tailwind CSS 4, shadcn-svelte). |
| `deploy/` | Grafana dashboard and the logs and traces stack. |

## Run it locally

You need Go, [Bun](https://bun.sh) 1.4, and PostgreSQL.

1. Set the required environment variables:

   ```sh
   export DATABASE_URL='postgres://user:password@localhost:5432/orpheus'
   export AUTH_COOKIE_SECRET='replace-with-a-long-random-secret'
   export DOMAIN='localhost'
   export AUTH_RP_ORIGIN='http://localhost:8080'
   ```

2. Build the frontend and start the server. The server applies migrations on startup.

   ```sh
   bun install --cwd frontend --frozen-lockfile
   bun run --cwd frontend build
   go run ./cmd/orpheus
   ```

3. Open `http://localhost:8080` and create your account.

Without `RABBITMQ_URL`, saved songs keep their download jobs pending. Run `orpheus-consumer` and set `RABBITMQ_URL` to download audio.

### Work on the frontend

Run the Go server on port 8080, then start Vite in another terminal:

```sh
bun run --cwd frontend dev
```

Open the Vite URL, usually `http://localhost:5173`. Vite proxies `/api` to Go so session cookies stay on one origin. To test passkeys, set `AUTH_RP_ORIGIN` to the Vite origin. If Go runs somewhere else, set `API_PROXY_TARGET`.

To see the UI without a database, build the frontend and run the synthetic preview server:

```sh
python3 frontend/tests/preview_server.py
```

It serves the app at `http://127.0.0.1:8082` with fake songs, silent audio, and canned discovery results.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Required | PostgreSQL connection string. The connection must support a persistent session for `LISTEN`. Transaction-only pooling does not work. |
| `AUTH_COOKIE_SECRET` | Required | Signs session and passkey challenge cookies. |
| `DOMAIN` | Required | WebAuthn relying-party ID. A hostname without a scheme. |
| `AUTH_RP_ORIGIN` | Required | The full browser origin, such as `https://music.example.com`. |
| `RABBITMQ_URL` | Empty | Broker for `orpheus-consumer`. Required when `APP_ENV=production`. |
| `OUTBOX_DISPATCH_ENABLED` | `true` if `RABBITMQ_URL` is set | Set to `false` to keep recording jobs without publishing them. |
| `YOUTUBE_API_KEY` | Empty | Required for adding songs. |
| `MUSIC_LIBRARY_PATH` | `/music` | The folder `orpheus-consumer` writes to. |
| `PORT` | `8080` | HTTP port. |
| `APP_ENV` | `development` | `production` turns on secure cookies. |
| `HTTP_TIMEOUT_SECONDS` | `15` | Timeout for YouTube, Deezer, and LRCLib calls. |
| `AUTH_REGISTRATION_ENABLED` | `false` | Registration closes after the first account, because every account can edit and delete songs. Set to `true` to allow more accounts. |
| `LIBRARY_CACHE_ENABLED` | `true` | Set to `false` to serve `GET /api/songs` from SQL every time. |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Empty | Turns on trace export. See [observability](deploy/observability.md). |
| `OTEL_TRACES_SAMPLER_ARG` | `1.0` | Trace sampling ratio from 0 to 1. |

`AUTH_EMAIL` (or `AUTH_USERNAME`) with `AUTH_PASSWORD` or `AUTH_PASSWORD_HASH` are legacy credentials. The first successful login moves them into the database. After that, only the database password works, so remove them from the environment.

## Test

```sh
go test ./...
bun run --cwd frontend check
bun run --cwd frontend test
```

Use `bun run test`, not `bun test`. `bun test` starts Bun's own runner and skips the Vitest setup.

Integration tests run against real PostgreSQL and RabbitMQ in Docker:

```sh
go test -race -tags=integration ./internal/store ./internal/services -count=1
```

The full suite also builds the real consumer. Check out `orpheus-consumer` next to this repository, or set `ORPHEUS_CONSUMER_DIR`:

```sh
go test -race -tags=integration ./... -count=1
```

Without Docker, the database tests can use a local PostgreSQL server that allows `CREATE DATABASE`. Each test creates and drops its own database:

```sh
ORPHEUS_TEST_POSTGRES_URL='postgres://localhost/postgres?sslmode=disable' \
	go test -race -tags=integration ./internal/store -count=1
```

[Testing song discovery](docs/discovery-testing.md) lists the manual cases for the add-song flow. CI runs unit and core integration tests on every push and pull request. The `Outbox end-to-end` workflow runs this repository and a chosen consumer ref together.

## Deploy

The `Dockerfile` builds the frontend and the server into a single static image that listens on port 8080. Deploy the web image and `orpheus-consumer` against the same database and music folder. For metrics, logs, and traces, see [observability](deploy/observability.md).
