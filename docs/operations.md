# Operations

This page describes how Orpheus schedules file work, serves the library and audio, and how to repair stuck jobs.

## Job pipeline

Every import, metadata, artwork, or lyrics edit, audio source replacement, regeneration, deletion, and CLI request writes a row to `song_job_outbox`. The song change and its job commit in the same transaction. Requests never connect to RabbitMQ, so they succeed during a broker outage. A response flag such as `fileUpdateQueued` means the job is durably scheduled, not done.

| Action | Queued by | What `orpheus-consumer` does |
| --- | --- | --- |
| `process-song-data` | Import, audio source replacement, regeneration, the redownload CLI | Downloads new audio. |
| `update-song-files` | Metadata or artwork edits | Rewrites tags and artwork with ffmpeg stream copy, then moves renamed songs into the artist/album/title layout. |
| `update-song-lyrics` | Lyrics edits | Rewrites only the `.lrc` sidecar. Synced lyrics win over plain lyrics. Clearing both removes the sidecar. |
| `delete-song-files` | Song deletion | Removes the audio, the sidecars, and partial downloads for that song. |

### Dispatch

A goroutine listens for `song_jobs_ready` on a dedicated PostgreSQL connection. A trigger sends that notification when a job row commits. The dispatcher scans for existing work after it starts listening and again after every reconnect. While idle it blocks, waking only for notifications and for retry or lease deadlines.

- Each publication holds a 30-second lease and has a five-second network timeout. Another instance can recover an expired lease. Lease tokens stop a stale worker from changing a newer claim.
- Failed publications retry with jittered exponential backoff, capped at five minutes. They are never discarded.
- Messages are persistent, mandatory, and broker-confirmed. `published_at` is set only after the broker confirms.
- Each message has an `eventId`, also sent as the AMQP `MessageId`. The consumer sets `completed_at` on the same outbox row, in the transaction that commits its song changes. A duplicate event skips media work.
- Completed rows are kept for seven days. That is the duplicate window. Unfinished rows are kept until they finish.
- File work is retryable, not exactly once. A crash after file work and before the database commit repeats the work safely.

Set `OUTBOX_DISPATCH_ENABLED=false` to pause publishing. Jobs keep accumulating and drain when dispatch resumes.

### File moves

`songs.audio_file_path` holds the current audio location. Playback keeps using the old path until a rename commits. Old files are removed after the new location commits. Pending cleanup is stored in `song_file_cleanup`, so it survives a crash. The consumer locks each song while it works, so queued edits always read committed metadata.

## Library and audio performance

First-party API routes target p99 under 5 ms to first byte. Routes that call YouTube, Deezer, or LRCLib, and bcrypt login and registration, are excluded. `orpheus_http_time_to_first_byte_seconds` records this. The Grafana p99 panel uses it so that audio streams count at their first byte.

`GET /api/songs` is served from an in-memory cache. Its order comes from PostgreSQL `ORDER BY` results, so collation and pagination match the SQL path. Statement-level triggers (migration `0013_library_change_notify`) notify every replica when `songs` or `user_song_plays` change, including writes from `orpheus-consumer`. A replica's own writes invalidate the cache immediately, so you always read your own writes. If the listener is down, a reload fails, or a cursor no longer matches the snapshot, the request falls back to SQL. `orpheus_library_cache_requests_total{result}` counts hits and each fallback reason.

Audio is served with `Cache-Control: private, no-cache` and an ETag built from the file's modification time and size, so replays get a 304. The player prefetches the next queued song unless the browser reports Save-Data or 2G. Audio files must have the `moov` atom first (`ffmpeg -movflags +faststart`). Otherwise browsers make extra range requests before playback starts.

`orpheus_playback_start_duration_seconds` measures what a listener waits for. The browser measures from a play request (a click, Next, or auto-advance) until audio plays and posts the value to `POST /api/metrics/playback-start`. Labels are `trigger` (`manual` or `auto`) and `prefetched`. Resumes and abandoned loads are not counted.

The connection pool keeps four warm connections and jitters connection recycling unless `pool_min_conns`, `pool_max_conn_lifetime_jitter`, or `pool_health_check_period` are set in `DATABASE_URL`. Keep PostgreSQL on the same host or private network as the web container. Avoid tight container CPU limits, because CFS throttling shows up directly in p99.

## Deleting songs

`DELETE /api/songs/{trackId}` returns `202` with `deletionQueued: true`. In one transaction it marks `songs.deleted_at`, makes the song unavailable, removes its play counts and lyrics, stores the cleanup targets, and queues `delete-song-files`. Deleting again returns `204`. An unknown ID returns `404`. If a worker holds the song row for more than three seconds, the endpoint returns a retryable `503 song_busy`.

Deleted rows stay as hidden tombstones, so a delayed job cannot recreate the files. There is no undo, and the same song ID cannot be imported again. The batch import endpoint reports `code: "song_deleted"` for that item. Other open tabs update through a storage event. Other devices update on their next library refresh.

The consumer deletes only inside the library root and keeps any file that an active song still uses. Missing files are fine. Artist and album folders and shared YouTube metadata are left alone. If cleanup fails, the targets and the unfinished outbox row stay for a retry.

### Repair stuck cleanup

Find unfinished cleanup, including jobs already published or in the dead-letter queue:

```sql
SELECT id, song_id, created_at, published_at, attempts, last_error
FROM song_job_outbox
WHERE action = 'delete-song-files' AND completed_at IS NULL
ORDER BY created_at;

SELECT * FROM song_file_cleanup WHERE song_id = 'TRACK_ID';
```

After you fix the file, path, or permission problem, publish the same event again:

```sql
UPDATE song_job_outbox
SET published_at = NULL, available_at = now(), lease_token = NULL,
	lease_until = NULL, last_error = NULL
WHERE id = 'EVENT_UUID' AND action = 'delete-song-files'
	AND completed_at IS NULL;
```

The trigger wakes the dispatcher. Duplicate deliveries are safe.

## Monitoring the backlog

| Metric | Meaning |
| --- | --- |
| `orpheus_outbox_pending` | Jobs not yet published. |
| `orpheus_outbox_oldest_created_timestamp_seconds` | Creation time of the oldest pending job. Use `time() - …` for its age when the value is nonzero. |
| `orpheus_queue_publish_total{result}` | Publications that succeeded or failed. |
| `orpheus_deletion_pending` | Deletions not yet completed, including published ones. |
| `orpheus_deletion_oldest_created_timestamp_seconds` | Creation time of the oldest unfinished deletion. |

The backlog gauges refresh when the dispatcher wakes. A paused instance does not refresh them, so query the database directly while dispatch is paused. Logs include event IDs, attempts, and retry errors.

## Download songs again

`cmd/redownload-library` queues existing songs through the outbox. It needs only `DATABASE_URL`. A running web server publishes the jobs. By default it queues songs whose `songs.is_available` is false or null.

```sh
go run ./cmd/redownload-library
```

| Flag | Effect |
| --- | --- |
| `--dry-run` | Print matching songs as tab-separated `track_id`, `song`, and `artist` without queueing. |
| `--limit N` | Stop after N songs. |
| `--all` | Include available songs too. |
| `--updated-after`, `--updated-before` | Limit to songs updated in an RFC 3339 window. |
| `--action update-song-files` | Remux available songs in place without downloading, for example to apply `+faststart`. Cannot be combined with `--all`. |

The CLI does not change `songs.is_available`. The consumer marks a song available when its download completes.

## iOS passkey sign-in

The iOS app signs in through the system authentication browser with the same passkeys as the web app. It needs no Associated Domains capability.

1. The app calls `POST /api/auth/native/begin` with a random state and an S256 PKCE challenge.
2. The browser opens `/auth/native`. The user must be signed in, the Origin must match exactly, and the user confirms.
3. The browser redirects to `orpheus://auth/callback` with an authorization code. The code expires in one minute.
4. The app calls `POST /api/auth/native/exchange` with the PKCE verifier. The server consumes the code once and sets the normal session cookie.

Grants live in the database (migration `0010_native_login`), so the flow works across replicas. `AUTH_RP_ORIGIN` must match the public browser origin.
