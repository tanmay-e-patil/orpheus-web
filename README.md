# Orpheus

A personal music library with a Go backend and a Svelte 5 + TypeScript frontend, built with Vite, Tailwind CSS 4, and shadcn-svelte.

## Architecture

```mermaid
flowchart LR
    Browser[Browser\nSvelte 5] -->|HTTP / JSON| App[Orpheus Web\nGo HTTP server]
    App -->|queries and migrations| DB[(PostgreSQL)]
    App -->|search and metadata| APIs[YouTube · Deezer · LRCLib]
    App -->|song changes + job requests| DB
    DB -->|NOTIFY wakes dispatcher| Dispatcher[Outbox dispatcher]
    Dispatcher -->|confirmed publication| Queue[(RabbitMQ)]
    Queue --> Consumer[orpheus-consumer]
    Consumer -->|writes audio| Music[(Shared music library)]
    Consumer -->|marks available| DB
    App -->|streams .m4a| Music
```

Frontend source lives in `frontend/`; `npm run build --prefix frontend` produces the static frontend in `web/`, which the Go server serves. Generated assets are not committed. Docker builds the frontend automatically. Audio processing is
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
export OUTBOX_DISPATCH_ENABLED='true'  # Defaults to true when RabbitMQ is configured
export MUSIC_LIBRARY_PATH='/music'     # Defaults to /music
export PORT='8080'                     # Defaults to 8080
export APP_ENV='development'           # Use production for secure cookies
export HTTP_TIMEOUT_SECONDS='15'       # External API timeout
```

`DOMAIN` is the WebAuthn relying-party ID (a hostname without a scheme), while
`AUTH_RP_ORIGIN` is the full browser origin. `RABBITMQ_URL` enables publishing
committed songs to `orpheus-consumer`; if omitted in development, metadata is
stored and jobs remain pending until dispatch is enabled. `MUSIC_LIBRARY_PATH` must point at the
same directory used by the consumer.

`AUTH_EMAIL` (or `AUTH_USERNAME`) plus `AUTH_PASSWORD` or `AUTH_PASSWORD_HASH`
are optional legacy credentials. On first successful login they are migrated
to the database and are no longer needed.

Install Node.js 24, then build the frontend and start Go:

```sh
npm ci --prefix frontend
npm run build --prefix frontend
go run ./cmd/orpheus
```

For frontend development, run Go on port 8080 and Vite in another terminal:

```sh
npm run dev --prefix frontend
```

Open the Vite URL (usually `http://localhost:5173`). Vite proxies `/api` to Go so session cookies stay on the browser origin. Set `AUTH_RP_ORIGIN` to that Vite origin when testing passkeys. Override the proxy destination with `API_PROXY_TARGET` if Go runs elsewhere.

The production app keeps the existing URLs and API contracts. Playback stays mounted across navigation, and saved add-song drafts retain their existing local-storage keys. Appearance is controlled in Settings; the former theme presets are replaced by Light, Dark, and System.

Library audio uses one persistent native audio element. Where available, the
Audio Session API declares music playback, and the Media Session API supplies
lock-screen metadata, transport controls, and progress. These APIs are optional;
they do not override browser or operating-system background playback policies.

For mobile playback validation, start a library song from a tap in Safari on
iPhone and Chrome on Android, then lock the phone. Verify that audio continues,
lock-screen pause/resume and seeking work, and the next queued song starts with
updated metadata. Also check switching apps, returning to the page, and pausing
before locking (it should stay paused). Repeat across a track boundary; desktop
tests cannot reproduce a phone suspending its browser. Test library audio in the
Song tab separately from embedded YouTube video playback.

Open `http://localhost:8080`.

See [the local discovery testing guide](docs/discovery-testing.md) for automatic matching, manual mode, confidence rules, and regression cases.

## Native iOS passkey sign-in

The iOS client uses the system authentication browser and the existing web passkeys. It does not require Apple's Associated Domains capability or paid Apple membership.

`/auth/native` hosts the browser flow. The native client starts it with `POST /api/auth/native/begin` using a random state and S256 PKCE challenge. Browser authorization requires an authenticated account, exact Origin, and explicit confirmation; registration is bound to the account already signed in on iOS. The fixed `orpheus://auth/callback` returns a short-lived authorization code, never a session token. `POST /api/auth/native/exchange` requires the verifier and atomically consumes the code before issuing the normal session cookie.

Deploy the frontend and Go server together. Startup migration `0010_native_login` creates the database-backed, one-use grant store so the flow works across replicas. Consumed request records expire after five minutes; authorization codes expire after one minute. No new environment variables or secrets are required. `AUTH_RP_ORIGIN` must match the public browser origin, as it already must for web passkeys.

Grant tests run with:

```sh
go test ./internal/http -run Native
go test -tags=integration ./internal/store -run '^TestNativeLoginGrantSingleUse$' -count=1
```

## Verify

```sh
go test ./...
npm run check --prefix frontend
npm test --prefix frontend
npm run build --prefix frontend
```

The app keeps the existing `songs` and `yt_music_videos` schema and serves the static frontend from `web/`.

## Redownload library files

Use the redownload CLI to schedule existing songs for `orpheus-consumer` through
the database outbox. It needs only `DATABASE_URL`; a running web dispatcher
publishes the jobs, including after a RabbitMQ outage. By default it queues only songs where `songs.is_available`
is false or null.

```sh
DATABASE_URL='postgres://...' \
go run ./cmd/redownload-library
```

Preview matches without scheduling:

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

The CLI records the same `process-song-data` requests used by imports. It does not
update `songs.is_available`; the consumer remains responsible for marking
completed downloads available. Migration 0009 must already have been applied by
the web application.

## Library file updates

Metadata edits queue `update-song-files`: the consumer reuses the existing audio,
rewrites tags/artwork with ffmpeg stream copy, and moves renamed tracks into the
artist/album/title layout. Lyrics edits queue `update-song-lyrics` and only update
the `.lrc` sidecar. Sidecars use synced lyrics when available and otherwise plain
lyrics, matching existing exports. Clearing both removes the sidecar. Audio-source replacements and
manual regeneration still queue `process-song-data` to download new audio.

`songs.audio_file_path` records the current relative audio location, so playback
continues from the old location until a rename is complete. Obsolete audio and
sidecars are removed after the new location is committed; pending cleanup is
persisted in `song_file_cleanup` for retries. The consumer locks each song while
processing so queued edits read committed metadata and cannot race each other.
Paused dispatch saves edits and keeps durable jobs pending until dispatch resumes.

## Transactional job dispatch

Every import, metadata/artwork/lyrics edit, source replacement, regeneration, and
CLI request records its job in `song_job_outbox`. Song changes and their jobs
commit together. Requests do not connect to RabbitMQ and can succeed during a
broker outage. Response flags such as `fileUpdateQueued` mean durably scheduled.

A goroutine listens on a dedicated PostgreSQL connection for `song_jobs_ready`.
A table trigger emits notifications only on committed inserts/updates. After
registering the listener, the dispatcher scans for existing work; it does the
same after reconnecting. While idle it blocks instead of polling every second.
Retry and lease-expiration deadlines wake it when necessary. Completed-job
maintenance runs at startup/reconnect and once daily.

Each publication has a 30-second claim lease and a five-second network timeout.
Expired claims can be recovered by another instance; lease tokens prevent stale
workers from changing newer claims. Failed publications use exponential backoff
with jitter, capped at five minutes, and are never automatically discarded.
Publication uses persistent messages, mandatory routing, and broker confirms.
At this workload, each attempt uses a fresh bounded AMQP connection.

Each request has an `eventId` (also AMQP `MessageId`); `jobId` remains the song ID.
The dispatcher sets `published_at` after confirmation. The consumer checks and
sets `completed_at` on that same outbox row, in the transaction that completes its
song changes. Duplicate completed events skip media work but resume pending file
cleanup before acknowledgement. Consumer retry/DLQ handoffs are also confirmed.
Legacy messages without `eventId` remain supported. Separate requests are not
coalesced: consumers reconcile current committed metadata rather than replaying
historical snapshots, and strict request ordering is not promised.

Completed receipts are retained for seven days (the duplicate/replay window).
Unfinished jobs are retained indefinitely. After that window, replayed event IDs
whose rows were pruned are rejected by the consumer rather than reprocessed.
Filesystem effects remain retryable, not exactly once. A crash after file work
but before the database commit can repeat work safely.

`OUTBOX_DISPATCH_ENABLED=false` pauses dispatch without disabling durable
scheduling. Without `RABBITMQ_URL` in development, dispatch defaults to paused;
configuring it later drains the backlog. PostgreSQL connectivity must support a
persistent session for `LISTEN`, rather than transaction-only pooling.

Metrics include `orpheus_outbox_pending`,
`orpheus_outbox_oldest_created_timestamp_seconds`, and
`orpheus_queue_publish_total{result="success|failed"}`. Backlog gauges refresh at
dispatcher wake-ups; paused instances do not refresh them. Use
`time() - orpheus_outbox_oldest_created_timestamp_seconds` for backlog age when the
oldest timestamp is nonzero. Logs include event IDs, attempts, and retry errors.

## Testcontainers integration tests

Docker access is required. Fast unit tests continue to run without Docker:

```sh
go test ./...
```

Run database/notification/broker failure tests independently of the consumer:

```sh
go test -tags=integration ./internal/store ./internal/services -count=1
```

For the complete suite, check out the matching consumer code in the sibling
`../orpheus-consumer` directory, or set `ORPHEUS_CONSUMER_DIR`:

```sh
go test -tags=integration ./... -count=1
(cd ../orpheus-consumer && go test -tags=integration ./... -count=1)
```

Consumer tests load this application's actual migrations from the sibling
`../orpheus-web` directory; set `ORPHEUS_WEB_DIR` for a different layout.
Tests use pinned PostgreSQL/RabbitMQ images and disposable data. The end-to-end
suite builds the real consumer in an Alpine container with ffmpeg, generates
its own audio fixture, checks tags/renames/LRC updates, and restarts the consumer.
It never contacts YouTube or metadata APIs. Crash hooks exercise publication and
completion boundaries deterministically; tests use bounded conditions rather
than fixed sleeps to wait for work.

CI runs unit and core Testcontainers tests on pushes and pull requests. The
`Outbox end-to-end` workflow accepts a matching consumer ref and runs the complete
web and consumer suites together, allowing coordinated changes across repositories.

## Outbox rollout

1. Deploy this web version with `OUTBOX_DISPATCH_ENABLED=false` to apply migration
   0009 and start recording jobs without publishing them.
2. Deploy the matching `orpheus-consumer` version with same-row event completion.
3. Enable dispatch and restart the web application. Monitor the backlog and logs.

The consumer changes are in the sibling `../orpheus-consumer` repository. Old
consumers can decode the extra JSON field, but do not record completion, so deploy
the matching consumer before enabling dispatch. Reverting to direct-publishing
web versions would remove the atomic scheduling guarantee.

## Deleting a Library Song

Choose **Delete song** immediately after **Edit song** in a Library song's actions
menu. Confirmation names the song and explains that deletion affects everyone in
the shared library. Any authenticated user can delete, following the existing edit
permissions. The song disappears after the server accepts deletion; local playback
stops if it was the current song. Other queue entries keep playing unchanged.
Other tabs on the same origin invalidate their queues and caches through a browser
storage event. Other devices update on their next library refresh. Already-open
audio streams and previously downloaded bytes cannot be revoked.

`DELETE /api/songs/{trackId}` returns `202` with `deletionQueued:true` after one
transaction marks `songs.deleted_at`, makes the song unavailable, removes its play
counts and stored lyrics, persists cleanup targets, and inserts `delete-song-files`
in `song_job_outbox`. Repeated deletion returns an empty `204`; an unknown ID
returns `404`. A worker holding the song row can delay acceptance: the endpoint
bounds its lock wait to three seconds and returns retryable `503 song_busy` if
necessary. Broker outages and paused dispatch do not prevent accepting deletion.

The matching consumer removes the stored audio path, metadata-derived path,
obsolete paths, and their LRC sidecars, plus attributable song-specific partials.
It uses the existing song/path locks, preserves files referenced by active songs,
and confines deletion to the library root. Missing files are harmless. Failed
cleanup retains its targets and unfinished receipt for retries or DLQ repair;
event completion happens only after cleanup succeeds. Artist/album directories,
shared YouTube metadata, and legacy temporary files that cannot be attributed to
one song remain untouched.

Deleted rows remain as hidden tombstones so delayed UUID/legacy jobs cannot
recreate files. This retains identity and metadata, rather than erasing all
database history. There is no undo or re-import of the same song ID in this
version. The batch import endpoint preserves its per-item response contract and
reports `code: "song_deleted"` for that item. Edits, lyrics, new audio requests,
play recording, redownloads, and album-art refresh exclude tombstones. Existing
metadata uniqueness constraints still apply to retained rows.

For rollout, apply migration **0011** before starting the updated consumer; it
adds the deletion column and outbox action. Deploy the matching consumer changes
(based on `orpheus-consumer` commit `a14a1fa`), drain/replace all older workers and
backfill processes, then deploy this web/API/UI version to expose deletion.
With the preceding migrations already applied, pre-apply the additive schema
without exposing the new web release (normal application startup will record it
in `schema_migrations` when it rechecks the idempotent up migration):

```sh
psql "$DATABASE_URL" --single-transaction \
  --file internal/store/migrations/0011_song_deletion.up.sql
```

Deploy the consumer next and replace older workers before the web release;
pausing dispatch alone does not stop already-published jobs on old workers. Do not roll back the consumer's tombstone guards while tombstones or
cleanup jobs exist. The down migration refuses to remove tombstones.

Inspect unfinished cleanup, including events already published or in the DLQ:

```sql
SELECT id, song_id, created_at, published_at, attempts, last_error
FROM song_job_outbox
WHERE action = 'delete-song-files' AND completed_at IS NULL
ORDER BY created_at;
SELECT * FROM song_file_cleanup WHERE song_id = 'TRACK_ID';
```

After repairing an I/O/path/permission failure, republish the **same event UUID**:

```sql
UPDATE song_job_outbox
SET published_at = NULL, available_at = now(), lease_token = NULL,
    lease_until = NULL, last_error = NULL
WHERE id = 'EVENT_UUID' AND action = 'delete-song-files'
  AND completed_at IS NULL;
```

The trigger wakes the dispatcher. Duplicate deliveries remain safe. Monitor
`orpheus_deletion_pending` and
`orpheus_deletion_oldest_created_timestamp_seconds`; they include published jobs
waiting for completion. These gauges update when the dispatcher wakes, so inspect
the database directly while dispatch is paused. Consumer logs retain event/song
IDs for failures after publication.

Database-only integration tests can also use a local PostgreSQL server when Docker
is unavailable. `ORPHEUS_TEST_POSTGRES_URL` must be a PostgreSQL URI for a test server
with CREATE DATABASE permission. Each fixture creates/drops an isolated database;
it does not migrate the supplied base database. RabbitMQ and container end-to-end
suites still require Docker:

```sh
ORPHEUS_TEST_POSTGRES_URL='postgres://localhost/postgres?sslmode=disable' \
  go test -race -tags=integration ./internal/store -count=1
```
