# Library Song Editing and Regeneration

## Goal

Let authenticated users fix existing Library Songs after they notice incorrect Song Metadata, poor audio quality, or out-of-sync lyrics.

The edit flow is for already-saved Library Songs first. Discovery/import improvements are out of scope unless they fall out naturally from reusable helpers.

## Domain Decisions

- A `trackId` in existing API/code is semantically a **Library Song ID**. It may originate from Spotify, Deezer, or older imports and must not be treated as provider-specific.
- Song Metadata is curated library data: name, artist, album, album art, release date, and stored duration.
- Audio Source metadata lives in `yt_music_videos`: YouTube title, channel, thumbnail, published date, duration, and view count.
- Audio Source Replacement changes the selected YouTube video for a Library Song, upserts `yt_music_videos`, updates `songs.yt_video_id`, updates `songs.duration` from the selected video, marks the song unavailable, and queues Audio File Regeneration.
- Audio File Regeneration rebuilds the playable `.m4a` from the current Library Song and Audio Source.
- V1 regeneration makes the Library Song temporarily unavailable.
- The web app only marks `songs.is_available=false`; the consumer owns file overwrite and completion.
- Lyrics changes never trigger Audio File Regeneration.

## UX Scope

Add a dedicated edit route:

```txt
/songs/{trackId}/edit
```

The player exposes an Edit action that navigates to this route for the current Library Song, including unavailable songs. The song table/list does not add edit actions in V1.

The edit page has independent save sections:

1. **Song Metadata**
   - Edit name, artist, album, album art, release date.
   - Do not expose duration editing.
   - Name, artist, and album are required.
   - Release date accepts empty, `YYYY`, or `YYYY-MM-DD`.
   - Empty release date preserves the existing value.
   - `YYYY` normalizes to `YYYY-01-01`.
   - Text-only metadata saves update the DB only and keep the song available.
   - Any exact-string album art change, including clearing it, requires confirmation and triggers Audio File Regeneration.

2. **Audio Source**
   - Show current Audio Source from `yt_music_videos` if available.
   - Default YouTube search query is `{song.name} {song.artistName}`.
   - Reuse `POST /api/discover/youtube`.
   - Show current source marked as current if it appears in results.
   - Disable replacement with the current source; users can use manual Regenerate instead.
   - Allow replacement with any video, but warn if candidate duration differs from current duration by more than 30 seconds or 20%.
   - Replacement updates Audio Source metadata but does not overwrite curated Song Metadata or lyrics.

3. **Lyrics**
   - Show stored lyrics and synced lyrics preview.
   - Allow LRCLIB reselection using a synthetic `MusicTrack` built from the Library Song:
     ```js
     {
       id: song.trackId,
       name: song.name,
       artist: song.artistName,
       album: song.albumName,
       albumImageUrl: song.albumArt,
       releaseDate: ""
     }
     ```
   - Reuse existing `/api/discover/lyrics/options` and `/api/discover/lyrics/custom-search` with that synthetic track.
   - Show stored lyrics and candidate LRCLIB lyrics compactly before saving.
   - Saving selected LRCLIB lyrics replaces both plain Lyrics and Synced Lyrics. If the selected option lacks synced lyrics, save synced lyrics as empty.
   - Reuse `POST /api/lyrics/save` for saving.
   - After lyrics save, fetch fresh song data because the existing endpoint returns only `{ ok: true }`.

4. **Lyrics Timing Adjustment**
   - Support global offset only in V1, not individual line editing.
   - Positive offset makes lyrics appear later; negative offset makes lyrics earlier.
   - Preset buttons: `-1s`, `-0.5s`, `+0.5s`, `+1s`.
   - Include numeric seconds input for precise offsets.
   - Preview adjusted timings in-memory before saving.
   - Save adjusted lyrics through `POST /api/lyrics/save` using current plain lyrics and adjusted synced lyrics.
   - Overwrite stored `synced_lyrics` with adjusted timestamps.
   - Clamp negative timestamp results to zero.
   - Rewrite timestamps at centisecond precision: `[mm:ss.xx]`.
   - Preserve non-timestamp LRC lines unchanged.
   - Disable timing adjustment when no synced lyrics exist and show: “No synced lyrics to adjust. Select LRCLIB synced lyrics or use Advanced edit.”
   - Include raw Lyrics/Synced Lyrics textareas behind an “Advanced edit” disclosure.

5. **Manual Regenerate**
   - Available even when the Library Song is currently available, with confirmation.
   - Requires a current Audio Source. Backend returns `409 no_audio_source` if missing.
   - Sets unavailable and queues regeneration from the current Audio Source.
   - Mostly idempotent: duplicate clicks may enqueue duplicate jobs, but state remains `is_available=false`; UI should disable while submitting.

## Regeneration Feedback

Regeneration-triggering responses return explicit status:

```json
{
  "song": {},
  "regenerationQueued": true,
  "songUnavailable": true
}
```

If queue is disabled in development:

```json
{
  "song": {},
  "regenerationQueued": false,
  "songUnavailable": true
}
```

For metadata-only saves:

```json
{
  "song": {},
  "regenerationQueued": false,
  "songUnavailable": false
}
```

After regeneration is requested, the edit page polls `GET /api/songs/{trackId}` every few seconds. When `song.isAvailable === true`, show “Audio ready.” Do not auto-navigate away. Provide Back to library / Play song actions when available.

## Backend API

### `GET /api/songs/{trackId}`

Authenticated. Loads a Library Song by ID, including unavailable songs.

Response:

```json
{
  "song": {
    "trackId": "...",
    "name": "...",
    "artistName": "...",
    "albumName": "...",
    "albumArt": "...",
    "duration": "...",
    "youtubeVideoId": "...",
    "isAvailable": true,
    "audioUrl": "/api/songs/.../audio",
    "lyrics": "...",
    "syncedLyrics": "...",
    "isLyricsAvailable": true,
    "playCount": 0
  },
  "audioSource": {
    "id": "...",
    "title": "...",
    "thumbnail": "...",
    "channelTitle": "...",
    "publishedAt": "...",
    "duration": "PT3M12S",
    "viewCount": "12345"
  }
}
```

### `PATCH /api/songs/{trackId}/metadata`

Authenticated.

Request:

```json
{
  "name": "...",
  "artistName": "...",
  "albumName": "...",
  "albumArt": "...",
  "releaseDate": "YYYY or YYYY-MM-DD or empty"
}
```

Rules:

- `name`, `artistName`, `albumName` required.
- Empty release date preserves existing value.
- `YYYY` normalizes to `YYYY-01-01`.
- Exact album art string change triggers regeneration.
- If regeneration is triggered and queue is configured but publish fails, rollback the DB update and return an error.
- If queue is disabled, commit DB update, set unavailable, and return `regenerationQueued:false`.

Response shape: regeneration status object above.

### `POST /api/songs/{trackId}/audio-source`

Authenticated.

Request body is the selected `YouTubeVideo` payload.

Rules:

- Reject same video as current source as a no-op (`409 same_audio_source`) or let UI prevent it.
- Upsert `yt_music_videos` with selected video metadata.
- Update `songs.yt_video_id`.
- Update `songs.duration` from selected video duration when present.
- Set `songs.is_available=false`.
- Queue Audio File Regeneration.
- If queue is configured but publish fails, rollback DB update.
- If queue is disabled, commit DB update and return `regenerationQueued:false`.

Response shape: regeneration status object above.

### `POST /api/songs/{trackId}/regenerate`

Authenticated.

Rules:

- Requires current `songs.yt_video_id`; otherwise `409 no_audio_source`.
- Sets `songs.is_available=false`.
- Queues Audio File Regeneration.
- If queue is configured but publish fails, rollback `is_available` change.
- If queue is disabled, commit unavailable state and return `regenerationQueued:false`.

Response shape: regeneration status object above.

### Existing lyrics endpoint

Reuse:

```txt
POST /api/lyrics/save
```

with:

```json
{
  "trackId": "...",
  "plainLyrics": "...",
  "syncedLyrics": "..."
}
```

## Store/API Implementation Notes

Add store methods for:

- Fetch one Library Song with play count for current user.
- Fetch current Audio Source by ID / joined from song.
- Update text metadata without regeneration.
- Update metadata with album-art-triggered regeneration inside a transaction.
- Upsert Audio Source + update song source/duration/unavailable inside a transaction.
- Mark unavailable for manual regeneration inside a transaction.

For regeneration-triggering operations, publish before committing the DB transaction when queue is configured:

1. Begin transaction.
2. Apply DB updates.
3. Publish RabbitMQ `process-song-data` for Library Song ID.
4. If publish fails, rollback.
5. Commit.

If queue is disabled, skip publish and commit.

## Frontend Implementation Notes

- Add route parsing for `/songs/{trackId}/edit` in the client router.
- Update server `knownAppPath` to serve the shell for `/songs/.../edit`.
- Add `API.song(trackId)`, `API.updateSongMetadata`, `API.replaceAudioSource`, `API.regenerateSong`.
- Add a `library-song-edit-page` component.
- Add player Edit action that navigates to `/songs/{encodeURIComponent(trackId)}/edit`.
- After edits, update player queue state:
  - Metadata save: update current queue song fields immediately.
  - Lyrics save/offset: update lyrics immediately or fetch fresh data.
  - Source/art/regenerate: update fields, mark `isAvailable=false`, and stop/clear playback if the current song became unavailable.
- Clear/reset IndexedDB song cache after any metadata/source/lyrics edit to avoid stale cached songs.

## Out of Scope for V1

- Bulk editing.
- Per-user ownership or edit permissions; the library remains shared among authenticated users.
- Changing Library Song ID after metadata edits.
- Deezer rematch for existing Library Songs.
- Staged replacement that keeps old audio playable until new audio is ready.
- Persisted regeneration reason/status beyond `songs.is_available`.
- Job progress tracking beyond availability polling.
- Embedded text tag rewriting without regeneration.
- Individual synced-lyrics line editing.
- Deleting Library Songs.

## Acceptance Criteria

1. User can open the current Library Song edit page from the player.
2. Edit page loads by deep link for available and unavailable Library Songs.
3. Text-only metadata save updates DB and keeps the song available.
4. Album art change requires confirmation, marks song unavailable, and queues regeneration.
5. Audio Source Replacement upserts `yt_music_videos`, updates `songs.yt_video_id`, updates duration, marks unavailable, and queues regeneration.
6. Manual Regenerate queues processing for current Audio Source and marks unavailable.
7. Queue publish failure rolls back regeneration-triggering DB changes when queue is configured.
8. Queue-disabled development mode commits DB changes and returns `regenerationQueued:false`.
9. User can choose new LRCLIB lyrics for a Library Song without needing a Deezer ID.
10. User can apply and preview a global synced-lyrics offset, then save adjusted Synced Lyrics.
11. Adjusted LRC preserves non-timed lines, clamps below-zero timestamps, and writes centiseconds.
12. Player queue and song cache do not show stale metadata/lyrics after edits.
