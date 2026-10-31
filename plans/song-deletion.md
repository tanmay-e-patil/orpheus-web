# Song deletion through the transactional outbox

## Outcome and scope

Allow authenticated users to delete a shared Library Song from its existing actions menu. Place **Delete song** directly after **Edit song** in `frontend/src/pages/Library.svelte`. Deletion immediately hides the song and prevents new playback or edits; the consumer removes its local audio and lyrics files asynchronously through the existing outbox.

Implemented across this repository and the matching sibling consumer on `main` (consumer commit `756fe39`, based on `a14a1fa`). See README for rollout and operational details.

V1 follows the existing shared-library authorization model: any authenticated user can delete a song for everyone. No bulk delete, undo, or per-user removal. Retain a hidden database tombstone to prevent delayed jobs or imports from resurrecting the same song ID. Re-importing that ID reports per-item `code: "song_deleted"` through the existing batch import response; restoring/re-importing deleted IDs requires a separate lifecycle design.

## Existing constraints

- `song_job_outbox.song_id` and `song_file_cleanup.song_id` reference `songs(id)` with `ON DELETE CASCADE`. Hard-deleting a song before cleanup would destroy durable work.
- Outbox dispatch already provides committed scheduling, publication retries, event UUIDs, and completion receipts. Reuse it; HTTP handlers must not publish to RabbitMQ or unlink files.
- The documented consumer serializes song processing and resumes persisted cleanup after duplicate deliveries. Deletion must extend that same locking and completion protocol, rather than assume queue ordering.
- `songs.audio_file_path` identifies the actual audio location, which can differ from the current metadata-derived path after an edit. `song_file_cleanup` also holds obsolete paths.
- The sibling `../orpheus-consumer` uses the matching outbox base `a14a1fa`, with deletion committed on `main` as `756fe39`. Changes span both repositories.

## User flow

1. Add a destructive **Delete song** action after **Edit song**, including for unavailable songs.
2. Open the existing dialog component with song title and artist. Copy: “Delete this song from the shared library? This removes it for everyone. Audio and lyrics files will be cleaned up in the background. This cannot be undone.”
3. Offer Cancel and Delete song; focus Cancel initially. Disable duplicate submissions and show a pending state.
4. Send `DELETE /api/songs/{trackId}`. Keep the song visible until the request succeeds. On failure, retain the dialog and show a retryable error.
5. On success, remove the song from the visible library and all occurrences in the local player queue, invalidate cached pages, and announce “Song deleted.”
6. If the deleted song is playing, stop playback and select the next remaining queue entry without autoplay; otherwise preserve the current song and playback position. If the queue becomes empty, clear the player. Adjust the index when removing earlier entries.

Use a reusable delete dialog/action so other song surfaces can adopt it later. The current player component has no Edit action, so no additional player button is required for V1.

## API and database transaction

Add authenticated `DELETE /api/songs/{trackId}` beside the existing song routes in `internal/http/router.go`.

- First successful request: `202 Accepted` with `{ "trackId": "...", "deletionQueued": true }`. “Queued” means committed to the outbox, including while dispatch is paused.
- Repeated request for an existing tombstone: `204 No Content`; do not enqueue another delete event. The client handles either success status without assuming a JSON body.
- Unknown ID: `404`; unauthenticated request: existing auth behavior. Database/locking failure returns an error with no partial deletion.
- GET song/audio and mutations against a tombstone return `404`. Import/upsert of a tombstoned ID reports per-item `code: "song_deleted"` in the existing batch response so discovery cannot silently restore it.

Add migration `0011_song_deletion` (or the next unused number at implementation time):

- Nullable `songs.deleted_at timestamptz`, with null meaning active.
- Extend the outbox action constraint to accept `delete-song-files`.
- Keep both existing foreign keys and cleanup records intact. Do not hard-delete songs in V1.
- Add an index for deletion maintenance only if its actual query needs it; avoid speculative indexes.

Implement `Store.DeleteSong` in one transaction:

1. Lock the song row; return not found or already deleted as appropriate.
2. Set `deleted_at`, `is_available=false`, and `updated_at`.
3. Persist cleanup targets for the current `audio_file_path`, its `.lrc` sidecar, and known obsolete files using the existing cleanup representation. Preserve existing pending targets. Use the established legacy-path fallback only when no stored path exists.
4. Delete this song's `user_song_plays` rows and clear stored lyrics/synced lyrics and their availability flag.
5. Insert one `delete-song-files` outbox event using `enqueueSongJob`.
6. Commit. Roll back all changes if any step fails.

Retain song identity/metadata needed by the consumer and a permanent deletion marker. This is application deletion with file cleanup, not complete erasure of database metadata. A later hard-purge feature must first decouple receipts/cleanup from cascading song foreign keys and address replay and ID reuse.

## Reads, writes, and concurrency

Audit every song access, rather than filtering only the Library page:

- Filter deleted songs from `FetchSongsPage`, `FetchLibrarySong`, `SongForAudio`, album-art refresh selection, and redownload selection/scheduling.
- Wrap the existing cursor `OR` predicates in parentheses when adding `deleted_at IS NULL`, for every sort order.
- Guard metadata, source replacement, regeneration, lyrics/artwork updates, imports/upserts, play recording, and `ScheduleSong` inside their transactions. A check outside the write transaction is insufficient.
- Serialize deletion and writes with the song row lock. Play recording must not insert a new play after deletion has removed counts.
- Reject tombstone upserts atomically and roll back associated video changes; never clear `deleted_at` in the ordinary import flow.
- Newly started audio requests cannot stream deleted songs. An already-open stream or previously downloaded client audio may continue; deletion does not revoke bytes already delivered.

Consumer requirements:

- Every media action, including legacy messages, checks deletion state after obtaining the existing per-song processing lock. Tombstoned songs skip downloads, metadata rewrites, sidecar creation, and availability updates. UUID events skipped this way receive terminal completion receipts.
- The delete worker obtains that same lock before discovering/removing files. An earlier running writer must finish before final cleanup; a later writer observes the tombstone and does no file work.
- Verify the matching consumer's lock scope. If it holds a row lock throughout slow media work, deletion may wait and hit the HTTP deadline. Keep this bounded and retryable; if prompt deletion is required, use a separate worker lock plus a short row-lock transaction and a deletion check before finalizing media. Never release serialization between the final check and filesystem finalization.
- Do not rely on broker delivery order, dispatcher claim order, or timestamps for correctness.

## File cleanup and completion

Add `delete-song-files` handling to the matching consumer:

1. Validate event ID/action/song association through the existing receipt protocol. Require a tombstone before removing files.
2. Under the song-processing lock, reconcile durable cleanup targets with the latest stored audio path, sidecar, obsolete paths, and known song-specific partial files. Capture paths produced by any writer that finished before this worker acquired its lock.
3. Remove only validated paths within `MUSIC_LIBRARY_PATH`. Reuse safe path helpers and reject traversal/symlink escapes. Never recursively delete an artist or album directory.
4. Check shared-path ownership under the same path coordination used by media writers. Preserve a file referenced by an active song and resolve the deleted song's cleanup target as intentionally retained. A check followed by an uncoordinated unlink is insufficient. Inspect existing path-collision handling before implementation; introduce common path locking if absent.
5. Treat missing files as success. Retry permission, I/O, and other transient failures using the existing retry/DLQ flow; retain failed cleanup targets and an unfinished delete event for repair.
6. After all targets are removed or safely retained for another song, clear `audio_file_path` and mark the delete event complete transactionally. Keep the tombstone. Completed duplicate deliveries remain harmless.

A crash after unlink but before database bookkeeping must retry safely. Never mark deletion complete before cleanup succeeds. Preserve the existing seven-day completed-receipt retention and indefinite unfinished-job retention; expose stuck published delete jobs as well as undispatched jobs. Document replay of the same event ID after a DLQ repair.

## Frontend state and cache

- Add `API.deleteSong(trackId)` in `frontend/src/lib/core/api.js`.
- Add `removeQueueSong(trackId)` in `player-store.js`, implementing the queue behavior above and emitting one state change.
- Reuse scoped IndexedDB reset/invalidation in `idb-song-cache.js`, covering song records and pagination/revision metadata. Remove the deleted row from in-memory results immediately after server success, then refresh pagination from the server.
- Prevent an already-running fetch/cache write from putting the deleted song back after success: abort or invalidate requests using a generation token before the refresh.
- Broadcast successful deletion to other same-origin tabs so their queues and caches update. Other users/devices converge on the next refresh; real-time cross-device invalidation is outside V1.

## Implementation slices

1. **Schema and read/write guards:** migration, tombstone filtering, protected imports/plays/edits, transaction tests. Keep the delete route/UI disabled.
2. **Consumer cleanup:** obtain matching consumer base, implement deletion action, shared locking, safe path handling, retry/completion, and legacy-message guards. Test worker crashes and concurrent processing.
3. **Delete endpoint:** atomic tombstone/cleanup/event transaction and HTTP tests. Verify broker outage and paused dispatch both preserve deletion intent.
4. **Delete UI:** action adjacent to Edit, confirmation, API helper, queue removal, cache invalidation, and cross-tab notification.
5. **Coordinated rollout:** apply additive migration, deploy consumer and web guards, drain/replace old consumer instances, then enable the endpoint and UI. Old workers must not remain able to write files for tombstones. Document rollback: disable new deletion requests but retain compatible guards/workers until outstanding cleanup completes; do not drop tombstones or action support while deletion jobs exist.

## Validation and acceptance

- Store integration tests: atomic rollback on enqueue failure; concurrent/repeated deletes produce one event; all list sorts/cursors exclude tombstones; imports, edits, CLI scheduling, and play recording cannot revive or mutate deleted songs.
- HTTP tests: authentication, first delete, repeated delete, unknown ID, hidden song/audio, and correct error handling.
- Frontend tests: Delete appears immediately after Edit; cancel sends no request; pending disables resubmission; failure preserves state; success removes rows/cache and all queue duplicates, preserving unrelated playback.
- Consumer integration tests: missing audio/LRC, obsolete paths, partial cleanup failure, duplicate/out-of-order messages, legacy jobs, unsafe/shared paths, and restart after unlink before completion.
- Deterministic concurrency tests: delete during regeneration/rename and delayed old jobs after cleanup cannot leave playable files or mark the tombstone available.
- Extend the existing real-consumer end-to-end suite: import a generated fixture, delete during broker outage, resume dispatch, verify audio/sidecar cleanup and completed receipt, replay an older process event, and verify no resurrection.
- Run appropriate Go unit/integration suites in both repositories, then frontend tests, check, and build. Record matching consumer ref for the coordinated end-to-end workflow.
- Update README with shared-library semantics, background cleanup, retained tombstones/re-import behavior, and inspection/replay instructions for failed deletion jobs.
