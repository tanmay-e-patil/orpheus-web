# Orpheus Go + Vanilla JS Port

Parallel implementation of Orpheus using a Go backend and static browser-native JavaScript.

## Architecture

```mermaid
flowchart LR
    Browser[Browser\nVanilla JS] -->|HTTP / JSON| App[Orpheus Web\nGo HTTP server]
    App -->|queries and migrations| DB[(PostgreSQL)]
    App -->|search and metadata| APIs[YouTube · Deezer · LRCLib]
    App -->|download jobs| Queue[(RabbitMQ)]
    Queue --> Consumer[orpheus-consumer]
    Consumer -->|writes audio| Music[(Shared music library)]
    Consumer -->|marks available| DB
    App -->|streams .m4a| Music
```

The Go server also serves the static frontend from `web/`. Audio processing is
handled out of process by `orpheus-consumer`; both applications must use the
same database and music-library directory.

## Run

Set the required environment variables:

```sh
export DATABASE_URL='postgres://user:password@localhost:5432/orpheus'
export AUTH_COOKIE_SECRET='replace-with-a-long-random-secret'
export DOMAIN='localhost'
export AUTH_RP_ORIGIN='http://localhost:8080'
```

Optional configuration:

```sh
export YOUTUBE_API_KEY=''              # Required for YouTube discovery
export RABBITMQ_URL='amqp://localhost' # Required when APP_ENV=production
export MUSIC_LIBRARY_PATH='/music'     # Defaults to /music
export PORT='8080'                     # Defaults to 8080
export APP_ENV='development'           # Use production for secure cookies
export HTTP_TIMEOUT_SECONDS='15'       # External API timeout
```

`DOMAIN` is the WebAuthn relying-party ID (a hostname without a scheme), while
`AUTH_RP_ORIGIN` is the full browser origin. `RABBITMQ_URL` enables publishing
committed songs to `orpheus-consumer`; if omitted in development, metadata is
stored but no audio file is generated. `MUSIC_LIBRARY_PATH` must point at the
same directory used by the consumer.

`AUTH_EMAIL` (or `AUTH_USERNAME`) plus `AUTH_PASSWORD` or `AUTH_PASSWORD_HASH`
are optional legacy credentials. On first successful login they are migrated
to the database and are no longer needed.

Then run:

```sh
go run ./cmd/orpheus
```

Open `http://localhost:8080`.

## Verify

```sh
go test ./...
find web/assets/js -name '*.js' -print -exec node --check {} \;
```

The app keeps the existing `songs` and `yt_music_videos` schema and serves the static frontend from `web/`.

## Redownload library files

Use the redownload CLI to republish existing songs to RabbitMQ for
`orpheus-consumer`. By default it queues only songs where `songs.is_available`
is false or null.

```sh
DATABASE_URL='postgres://...' RABBITMQ_URL='amqp://...' \
go run ./cmd/redownload-library
```

Preview matches without publishing:

```sh
DATABASE_URL='postgres://...' \
go run ./cmd/redownload-library --dry-run --limit 20
```

Dry runs print tab-separated `track_id`, `song`, and `artist` columns.

Queue unavailable songs updated in a window:

```sh
go run ./cmd/redownload-library \
  --updated-after 2026-05-01T00:00:00Z \
  --updated-before 2026-05-08T00:00:00Z
```

Queue every song updated in a window:

```sh
go run ./cmd/redownload-library \
  --all \
  --updated-after 2026-05-01T00:00:00Z \
  --updated-before 2026-05-08T00:00:00Z
```

The CLI publishes the same payload used by commits:
`{"jobId":"<track-id>","action":"process-song-data","timestamp":"<utc>"}` to
the durable `job_queue`. It does not update `songs.is_available`; the consumer
remains responsible for marking completed downloads available.
