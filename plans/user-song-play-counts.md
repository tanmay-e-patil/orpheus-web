# User Song Play Counts

## Goal

Track which songs each authenticated user plays, keep aggregate counts in a table, and let the tracklist sort from most played to least played for the current user.

## Decisions

- A play counts after the user has listened for **at least 10 seconds**.
- Play counts are **per current user**, not global.
- Store **aggregate counts only**, not individual play events.
- Frontend records a play by calling the backend after 10 seconds of actual playback.
- Count each qualifying playback once per loaded playback instance.
- The default tracklist sort remains Artist A-Z.
- Add an optional **Most played** sort toggle.
- Most-played sort includes zero-play songs after played songs.
- Search and most-played sort should work together.
- When a play is recorded, update visible UI counts, but do not reorder the active playback queue.
- Only count existing, available songs.
- Play counts are private to the current user.
- No backfill; all existing songs start at zero plays.

## Schema

Add a new migration after the current latest migration:

```sql
CREATE TABLE IF NOT EXISTS user_song_plays (
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  track_id text NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  play_count integer NOT NULL DEFAULT 0,
  last_played_at timestamp NOT NULL DEFAULT now(),
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, track_id)
);

CREATE INDEX IF NOT EXISTS user_song_plays_user_sort_idx
  ON user_song_plays (user_id, play_count DESC, track_id);
```

Down migration should drop the index and table.

## Backend API

### `GET /api/songs`

Add authenticated-user-aware play counts to every `LibrarySong` response:

```json
{
  "trackId": "...",
  "playCount": 12
}
```

Supported sorts:

- default / omitted: `artist_name asc, id asc`
- `sort=mostPlayed`: `play_count desc, artist_name asc, id asc`

For `sort=mostPlayed`, use cursor pagination with cursor fields:

```http
GET /api/songs?sort=mostPlayed&playCount=12&artistName=Artist&trackId=abc
```

Ordering:

```sql
ORDER BY coalesce(usp.play_count, 0) DESC, songs.artist_name ASC, songs.id ASC
```

Cursor predicate:

```sql
WHERE
  coalesce(usp.play_count, 0) < $cursorPlayCount
  OR (
    coalesce(usp.play_count, 0) = $cursorPlayCount
    AND songs.artist_name > $cursorArtist
  )
  OR (
    coalesce(usp.play_count, 0) = $cursorPlayCount
    AND songs.artist_name = $cursorArtist
    AND songs.id > $cursorTrack
  )
```

The join must be scoped to the current user:

```sql
LEFT JOIN user_song_plays usp
  ON usp.track_id = songs.id
 AND usp.user_id = $currentUserID
```

### `POST /api/songs/{trackId}/plays`

Add a protected endpoint that increments the current user's count for one song.

Behavior:

- Missing song: `404 not_found`
- Existing but unavailable song: `409 unavailable`
- Existing and available song: upsert/increment count

Response:

```json
{
  "trackId": "abc",
  "playCount": 13,
  "lastPlayedAt": "2026-06-02T00:00:00Z"
}
```

Implementation should read the user ID from auth middleware context, not re-parse the JWT.

Add a helper such as:

```go
func UserIDFromContext(ctx context.Context) (string, bool)
```

## Store changes

Add store methods along these lines:

```go
type SongSort string

const (
  SongSortArtist     SongSort = "artist"
  SongSortMostPlayed SongSort = "mostPlayed"
)

type FetchSongsOptions struct {
  UserID string
  Cursor *types.SongCursor
  Limit  int
  Sort   SongSort
}

func (s *Store) FetchSongsPage(ctx context.Context, opts FetchSongsOptions) (types.SongsPageResponse, error)
```

Extend `types.SongCursor` with optional `PlayCount`:

```go
type SongCursor struct {
  ArtistName string `json:"artistName"`
  TrackID    string `json:"trackId"`
  PlayCount  int    `json:"playCount,omitempty"`
}
```

Extend `types.LibrarySong`:

```go
PlayCount int `json:"playCount"`
```

Add recording method:

```go
type RecordedSongPlay struct {
  TrackID      string
  PlayCount    int
  LastPlayedAt time.Time
}

func (s *Store) RecordSongPlay(ctx context.Context, userID, trackID string) (RecordedSongPlay, error)
```

`RecordSongPlay` should:

1. Check song existence and availability.
2. Return distinguishable errors for missing vs unavailable.
3. Upsert:

```sql
INSERT INTO user_song_plays (user_id, track_id, play_count, last_played_at, created_at, updated_at)
VALUES ($1, $2, 1, now(), now(), now())
ON CONFLICT (user_id, track_id)
DO UPDATE SET
  play_count = user_song_plays.play_count + 1,
  last_played_at = now(),
  updated_at = now()
RETURNING play_count, last_played_at;
```

## Frontend changes

### API client

Add:

```js
recordSongPlay: (trackId) =>
  request(`/api/songs/${encodeURIComponent(trackId)}/plays`, { method: "POST" })
```

Update `API.songs` to accept a sort parameter and sort-aware cursor fields.

### Playback tracking

In the audio player/player store layer:

- Start tracking when a new song is loaded and playback begins.
- Accumulate actual listening time while the audio is playing.
- When accumulated listening time reaches 10 seconds, call `recordSongPlay(trackId)` once for that loaded playback instance.
- Pause/resume should continue accumulating.
- Seeking should not create extra counts.
- Loading/replaying the same song as a new playback instance can count again after another 10 seconds.
- Ignore `404`/`409` tracking failures silently; log only.

After successful response:

- Update that song's `playCount` in visible song collections/cache/player state.
- If the table is currently sorted by Most played, re-sort visible/search results.
- Do not mutate/reorder the active playback queue.

### Tracklist UI

Add a sort control above the table:

- Artist A-Z
- Most played

When Most played is active:

- Ask backend for `sort=mostPlayed` during paginated loading.
- Include `playCount` in client-side cached/search sorting.
- Show a `Plays` column in desktop table.
- Show `· N plays` in mobile rows.

Search behavior:

- Search filters first.
- If Most played is active, sort matches by `playCount desc`, then artist/name/id.

Cache note:

- Existing IndexedDB song cache should tolerate missing `playCount`; default to `0`.
- Consider including selected sort in cache keys/metadata, or bypass/reload cache when sort changes to avoid mixing artist-sorted pages with most-played pages.

## Tests

Backend/store:

1. First recorded play inserts `play_count = 1`.
2. Subsequent play increments the existing row.
3. Songs include current user's `playCount`, defaulting to `0`.
4. `sort=mostPlayed` orders by `play_count desc`, then artist/id.
5. Play counts are scoped by user.
6. Recording a missing song returns/ maps to `404`.
7. Recording an unavailable song returns/ maps to `409`.

Handlers:

1. `POST /api/songs/{trackId}/plays` requires auth.
2. Success returns updated `playCount` and `lastPlayedAt`.
3. Unavailable song returns `409 unavailable`.

Frontend/manual:

1. Play POST fires once after 10 seconds per loaded song.
2. Pause before 10 seconds then resume still counts after total reaches 10 seconds.
3. Selecting/replaying the same song can count again after another 10 seconds.
4. Most-played sorting works with search.
5. Current queue order does not change after a play count update.

## Rollout

1. Ship migration.
2. Ship backend store/API changes.
3. Ship frontend tracking and UI sort toggle.
4. Monitor logs for tracking endpoint errors.

## Open follow-ups, intentionally out of scope

- Global most-played charts.
- Daily/weekly listening history.
- Total listened seconds.
- Deduplication across devices/tabs beyond server-side atomic increments.
