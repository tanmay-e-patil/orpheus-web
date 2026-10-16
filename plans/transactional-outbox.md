# Transactional song-processing outbox

Implemented design; see README.md for operation, testing, and rollout.

- Song changes and their job requests commit in the same PostgreSQL transaction.
- A single `song_job_outbox` table tracks both `published_at` and `completed_at`.
  There is no separate processed-event table or status enum that can regress when
  a consumer completes before publication bookkeeping finishes.
- PostgreSQL LISTEN/NOTIFY wakes a dispatcher goroutine. Startup/reconnect scans
  recover existing work; retry and lease timers recover delayed/abandoned work.
  There is no one-second idle polling loop. A daily timer performs retention work.
- Claims use FOR UPDATE SKIP LOCKED and expiring lease tokens. Publication happens
  outside the claim transaction, uses broker confirms and mandatory routing, and
  retries with bounded exponential backoff and jitter.
- Event UUIDs survive publication, consumer retry, and dead-letter handoffs.
  Completed duplicates skip media work but still finish persisted file cleanup.
  Completion and the song's processing/path changes share one transaction.
- Imports, metadata, artwork refresh, lyrics, audio replacement, regeneration,
  and the redownload CLI all enqueue through the outbox. HTTP requests never
  publish to RabbitMQ. Unchanged metadata/artwork/lyrics do not create jobs.
- Paused/unconfigured dispatch still persists pending work. Enabling it later
  drains the backlog. Completed events have a seven-day replay window;
  unfinished events never expire. Filesystem effects are retryable, not exactly
  once. Consumers continue to accept legacy events without UUIDs.
- Testcontainers suites exercise real PostgreSQL/RabbitMQ failures and concurrency.
  Consumer tests cover atomic completion, duplicate suppression and cleanup, and
  confirmed retry/DLQ handoffs. The end-to-end suite runs the real consumer with
  ffmpeg and generated local audio, including recovery after a consumer restart.
- Rollout: apply migration 0009 with dispatch paused, deploy the matching consumer,
  then enable dispatch. Each repository must contain its matching changes.

References:

- https://www.postgresql.org/docs/current/sql-notify.html
- https://www.postgresql.org/docs/current/sql-listen.html
- https://www.rabbitmq.com/docs/confirms
- https://golang.testcontainers.org/modules/postgres/
- https://golang.testcontainers.org/modules/rabbitmq/
