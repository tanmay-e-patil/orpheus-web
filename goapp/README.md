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
