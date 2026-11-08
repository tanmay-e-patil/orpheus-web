# LLM Mixtapes Implementation Plan

## Decisions Locked

- Add primary nav/page: **Mixtapes** at `/mixtapes`.
- Mixtapes are saved, private per authenticated user, newest-first.
- V1 uses only existing playable songs (`songs.is_available = true`).
- Requested length defaults to 12; backend accepts integer 5–25; UI offers 8/12/16.
- Generation is async via RabbitMQ.
- Web app publishes jobs; external consumer performs embedding + LLM work and writes directly to Postgres.
- Retrieval uses pgvector embeddings primarily, with text/random fallback in consumer when coverage is low.
- Embeddings are generated asynchronously via RabbitMQ `embed-song` jobs.
- Saved details include title, description, ordered tracks, and per-track rationale.
- Strict JSON output/schema validation in consumer, with up to 2 corrective retries.
- Daily rate limit: 5 generation attempts per user per rolling 24h.
- Active concurrency limit: 3 pending/generating mixtapes per user.
- Users can delete mixtapes and retry failed mixtapes only.
- No sharing/export, no title editing, no regenerate-ready in v1.

## Phase 1 — Database Schema

Add migration `0006_mixtapes_and_embeddings.up.sql` and matching down migration.

### Extensions

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### `song_embeddings`

```sql
CREATE TABLE IF NOT EXISTS song_embeddings (
  song_id text PRIMARY KEY REFERENCES songs(id) ON DELETE CASCADE,
  embedding vector(1536) NOT NULL,
  model text NOT NULL,
  dimensions integer NOT NULL DEFAULT 1536,
  source_hash text NOT NULL,
  created_at timestamp DEFAULT now() NOT NULL,
  updated_at timestamp DEFAULT now() NOT NULL
);
```

Add vector index if supported by deployed pgvector version. Otherwise defer:

```sql
CREATE INDEX IF NOT EXISTS song_embeddings_embedding_idx
ON song_embeddings USING hnsw (embedding vector_cosine_ops);
```

If HNSW is unavailable, use IVFFlat or no index for v1 personal-library scale.

### `mixtapes`

```sql
CREATE TABLE IF NOT EXISTS mixtapes (
  id text PRIMARY KEY NOT NULL,
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  prompt text NOT NULL,
  requested_track_count integer NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  title text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  error_message text NOT NULL DEFAULT '',
  created_at timestamp DEFAULT now() NOT NULL,
  updated_at timestamp DEFAULT now() NOT NULL,
  completed_at timestamp
);
```

Recommended check constraints:

- `requested_track_count between 5 and 25`
- `status in ('pending', 'generating', 'ready', 'failed')`
- `length(prompt) <= 1000`
- `length(title) <= 120`
- `length(description) <= 1000`
- `length(error_message) <= 1000`

Indexes:

```sql
CREATE INDEX IF NOT EXISTS mixtapes_user_created_idx ON mixtapes(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS mixtapes_user_status_idx ON mixtapes(user_id, status);
```

### `mixtape_tracks`

```sql
CREATE TABLE IF NOT EXISTS mixtape_tracks (
  mixtape_id text NOT NULL REFERENCES mixtapes(id) ON DELETE CASCADE,
  track_id text NOT NULL REFERENCES songs(id),
  position integer NOT NULL,
  rationale text NOT NULL DEFAULT '',
  created_at timestamp DEFAULT now() NOT NULL,
  PRIMARY KEY (mixtape_id, position),
  UNIQUE (mixtape_id, track_id)
);
```

Checks:

- `position > 0`
- `length(rationale) <= 500`

### `mixtape_generation_attempts`

```sql
CREATE TABLE IF NOT EXISTS mixtape_generation_attempts (
  id text PRIMARY KEY NOT NULL,
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  mixtape_id text REFERENCES mixtapes(id) ON DELETE SET NULL,
  created_at timestamp DEFAULT now() NOT NULL
);
```

Index:

```sql
CREATE INDEX IF NOT EXISTS mixtape_generation_attempts_user_created_idx
ON mixtape_generation_attempts(user_id, created_at DESC);
```

## Phase 2 — RabbitMQ Publisher Contract

Extend `internal/services/queue.go`.

Actions:

- existing: `process-song-data`
- new: `embed-song`
- new: `generate-mixtape`

Methods:

- `PublishEmbedSong(ctx, trackID string) error`
- `PublishGenerateMixtape(ctx, mixtapeID, userID string) error`
- `Configured() bool` or `Available() bool` checking non-nil and URL non-empty

Payload shape remains:

```json
{
  "jobId": "entity-id",
  "action": "generate-mixtape",
  "timestamp": "2026-05-21T00:00:00Z"
}
```

Headers:

- For `embed-song`:
  - `x-job-id`: song ID
  - `x-song-id`: song ID
- For `generate-mixtape`:
  - `x-job-id`: mixtape ID
  - `x-mixtape-id`: mixtape ID
  - `x-user-id`: user ID

All generation/index/retry endpoints should reject with clear 503 if RabbitMQ is unconfigured/unavailable.

## Phase 3 — Embedding Source Hash Utilities

Add Go utility code in store/service layer so the web app can detect stale rows.

Embedding source text algorithm:

```text
Title: {name}
Artist: {artist_name}
Album: {album_name}
Duration: {duration}
Lyrics excerpt:
{first 2000 runes of plain lyrics}
```

If lyrics are empty, omit or leave empty lyrics excerpt consistently. Normalize line endings to `\n`. Hash with SHA-256 hex over UTF-8 bytes of exact source text.

Use same algorithm in consumer; document it.

## Phase 4 — Store Methods

Create `internal/store/mixtapes.go`.

Types:

- `MixtapeSummary`
- `MixtapeDetail`
- `MixtapeTrack`
- `IndexStatus`

Methods:

- `ListMixtapes(ctx, userID string) ([]MixtapeSummary, error)`
- `GetMixtapeDetail(ctx, userID, mixtapeID string) (MixtapeDetail, error)`
- `CreatePendingMixtape(ctx, userID, prompt string, requestedTrackCount int) (MixtapeSummary, error)`
- `DeleteMixtape(ctx, userID, mixtapeID string) error`
- `RetryMixtape(ctx, userID, mixtapeID string) (MixtapeSummary, error)` or transaction helper
- `CountActiveMixtapes(ctx, userID string) (int, error)`
- `CountGenerationAttemptsSince(ctx, userID string, since time.Time) (int, error)`
- `RecordGenerationAttempt(ctx, userID, mixtapeID string) error`
- `EmbeddingIndexStatus(ctx, model string, dimensions int) (IndexStatus, error)`
- `SongsNeedingEmbeddings(ctx, model string, dimensions, limit int) ([]string, error)`

Important transaction flows:

### Create

1. Validate prompt trim non-empty <= 1000.
2. Validate requested count 5–25; default 12.
3. Check attempts in rolling 24h < 5.
4. Check active pending/generating < 3.
5. Insert mixtape status `pending`.
6. Insert generation attempt.
7. Publish RabbitMQ job.
8. If publish fails, update mixtape `failed` with safe queue error and return 503.

### Retry

1. Verify owned mixtape exists and `status = failed`.
2. Check daily attempts and active concurrency.
3. Insert generation attempt.
4. Delete any stale `mixtape_tracks` for that mixtape.
5. Set `status = pending`, clear error, update timestamp.
6. Publish RabbitMQ job.
7. If publish fails, set `failed` with safe queue error and return 503.

Delete should hard-delete `mixtapes`; attempts remain via `ON DELETE SET NULL`.

## Phase 5 — HTTP API

Add `internal/http/handlers/mixtapes.go`.

Endpoints:

- `GET /api/mixtapes`
  - list summaries newest-first
- `POST /api/mixtapes`
  - body: `{ "prompt": string, "requestedTrackCount": number }`
  - creates pending mixtape + publishes `generate-mixtape`
- `GET /api/mixtapes/{id}`
  - detail with tracks, full song objects, position, rationale
- `DELETE /api/mixtapes/{id}`
  - hard delete owned mixtape
- `POST /api/mixtapes/{id}/retry`
  - retry failed only
- `GET /api/mixtapes/index-status`
  - returns playable count, embedded count, stale count
- `POST /api/mixtapes/index`
  - body optional `{ "limit": 100 }`
  - default 100, max 500
  - queues `embed-song` for bounded missing/stale playable songs

Update `internal/http/router.go`:

- Add handlers above.
- Add `/mixtapes` to `knownAppPath`.

Need handler access to current user ID. Current auth middleware stores user ID in an unexported key in `apphttp`. Either:

- add helper in `internal/http` package that injects user ID into request context and handlers can read via a small exported accessor, or
- pass `AuthService` and call `SessionFromRequest` in handlers.

Prefer adding a package-level helper if handler package can access it cleanly; otherwise pass auth/session data explicitly.

## Phase 6 — Frontend API Client

Update `web/assets/js/api.js`:

- `mixtapes()`
- `createMixtape(prompt, requestedTrackCount)`
- `mixtape(id)`
- `deleteMixtape(id)`
- `retryMixtape(id)`
- `mixtapeIndexStatus()`
- `queueMixtapeIndex(limit)`

## Phase 7 — Frontend Route/Nav

Update:

- `web/assets/js/router.js`
  - route `/mixtapes` -> `mixtapes-page`
- `web/index.html`
  - add nav link to desktop and mobile nav
- `web/assets/js/app.js`
  - import new component
- `web/assets/js/view-transitions.js`
  - optional: route transition classification for mixtapes; default is fine for v1

## Phase 8 — Mixtapes UI Component

Create `web/assets/js/components/mixtapes-page.js`.

Layout:

- Page header:
  - `h1`: Mixtapes
  - subtitle: generated mood-based mixes from your library
- Form:
  - textarea placeholder: “Describe the feeling, scene, or transition you want…”
  - examples:
    - late-night drive after a long week
    - nostalgic but hopeful
    - focus without feeling cold
    - songs for cooking with friends
  - select: 8 / 12 default / 16
  - button: Generate Mixtape
- Index status:
  - `Library indexed: embedded / playable playable tracks`
  - show stale count if nonzero
  - button: Continue indexing when missing/stale remain
- Single newest-first list of cards:
  - status badge: pending/generating/ready/failed
  - title or fallback prompt excerpt
  - prompt
  - description/error
  - created/completed time
  - actions:
    - ready: expand/play/delete
    - failed: retry/delete
    - pending/generating: delete
- Detail panel/expanded card:
  - ordered track list with album art, title, artist, duration, rationale
  - Play mixtape button
  - clicking a track starts playback from that position

Playback:

- Convert detail tracks to `song` queue array.
- Call existing `setQueue(queue, index)` from `frontend/src/lib/core/player-store.svelte.ts`.
- Existing player auto-advances.

Polling:

- Poll list every ~3s while any mixtape status is pending/generating.
- Poll index status every ~10s while embedded < playable or stale > 0.
- On page load, call `POST /api/mixtapes/index` with default/bounded limit only if agreed UX wants auto-start. Earlier decision: explicit POST; UI may call it on page load. Safer: page load can show status and provide button. If auto-start is desired, call once on load and handle errors quietly.

Recommended v1: show status and button, plus optionally queue first 100 on initial page load if RabbitMQ is configured.

## Phase 9 — Styles

Update `web/assets/css/app.css` with minimal classes:

- `.mixtapes-page`
- `.mixtape-form`
- `.mixtape-examples`
- `.mixtape-index-status`
- `.mixtape-card`
- `.mixtape-status-badge`
- `.mixtape-track-list`
- `.mixtape-track-rationale`

Reuse existing button/input/card visual language where possible.

## Phase 10 — Consumer Contract Documentation

Create `plans/mixtapes-consumer-contract.md`.

Include:

- RabbitMQ queue name: `job_queue`
- Actions: `embed-song`, `generate-mixtape`
- Payload and headers
- DB schema expected writes
- Embedding source text/hash algorithm
- Song embedding upsert requirements
- Mixtape generation status transitions
- Candidate retrieval recommendation:
  1. embed prompt
  2. top ~150 playable embeddings by cosine distance
  3. fallback to text/random candidates if needed
  4. fail only if fewer than 3 playable candidates
- LLM strict JSON schema:

```json
{
  "title": "string <= 120 chars",
  "description": "string <= 1000 chars",
  "tracks": [
    {
      "trackId": "existing candidate track ID",
      "rationale": "string <= 500 chars"
    }
  ]
}
```

- Validation rules:
  - no duplicates within mixtape
  - only candidate playable tracks
  - requested count target, shorter allowed when candidates limited
  - up to 2 corrective retries
  - user-safe errors only
- Idempotency:
  - `embed-song` no-ops when hash/model/dimensions already current
  - `generate-mixtape` no-ops if mixtape missing/deleted or already ready
  - transactionally delete/insert tracks only after valid output

## Phase 11 — Tests

Backend tests:

- Migration/split statements if needed.
- Store tests for:
  - create/list/detail/delete
  - user isolation
  - retry failed only
  - active concurrency limit
  - 5 attempts rolling 24h
  - attempt history survives delete
  - index status counts playable/missing/stale
  - source hash stability
- Handler tests for:
  - validation errors
  - queue unavailable returns clear error
  - publish failure marks failed and returns 503
  - detail returns full song objects + audio URLs

Frontend tests are not currently obvious in repo. If no JS test harness exists, manually verify:

- nav links desktop/mobile
- create pending card
- polling updates status
- ready detail plays ordered queue
- retry/delete actions
- index status and indexing button

## Open Implementation Notes

- Current handler package cannot directly read `userIDCtxKey` because it is in `apphttp`. Decide the cleanest accessor before coding.
- pgvector index syntax may vary by deployed version. Make migration robust or omit vector index initially.
- Web app does not need LLM env vars; consumer owns provider config.
- If RabbitMQ is unconfigured, create/index/retry must fail instead of creating stuck pending mixtapes.
