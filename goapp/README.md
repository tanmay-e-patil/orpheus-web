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
