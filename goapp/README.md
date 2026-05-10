# Orpheus Go + Vanilla JS Port

Parallel implementation of Orpheus using a Go backend and static browser-native JavaScript.

## Run

Set the required environment variables:

```sh
export DATABASE_URL='postgres://...'
export AUTH_USERNAME='...'
export AUTH_PASSWORD='...'
export AUTH_COOKIE_SECRET='change-me'
export YOUTUBE_API_KEY='...'
export RABBITMQ_URL='amqp://...'
export DOMAIN='http://localhost:8080'
export PORT='8080'
```

`RABBITMQ_URL` is required in production so committed songs can be queued for
`orpheus-consumer`. In development, leaving it empty disables queue publishing:
the song metadata is stored, but the downloaded file will not be created and
`songs.is_available` remains false until a consumer processes the job.

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

The port keeps the existing `songs` and `yt_music_videos` schema and does not register the old Next-generated service worker.

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
