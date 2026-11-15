package store

import (
	"context"
	"database/sql"
	"errors"
	"log/slog"
	"slices"
	"sync"
	"sync/atomic"
	"time"

	"github.com/jackc/pgx/v5"

	"orpheus-web/internal/metrics"
	"orpheus-web/internal/types"
)

const (
	librarySongsChannel  = "library_songs_changed"
	libraryPlaysChannel  = "library_plays_changed"
	libraryFreshnessWait = 250 * time.Millisecond
)

// LibraryCache serves FetchSongsPage from memory. Ordering is taken from
// PostgreSQL ORDER BY results, so collation and tie-breaking match the SQL path
// exactly. Changes made by any process (other replicas, media workers, psql)
// arrive through statement-level NOTIFY triggers; this process's own writes
// invalidate synchronously so a client always reads its own writes.
//
// The cache never serves data it cannot prove fresh: while the listener is
// disconnected, a reload is failing, or a cursor does not match the snapshot,
// callers fall back to the SQL path.
type LibraryCache struct {
	db        *Store
	songs     *reloadable[*songsSnapshot]
	plays     *reloadable[*playsSnapshot]
	listening atomic.Bool

	memoMu sync.Mutex
	memo   map[string]*mostPlayedOrder
}

type songsSnapshot struct {
	byArtist   []types.LibrarySong // ORDER BY artist_name, id
	byRecent   []int               // indexes into byArtist, ORDER BY created_at DESC, id
	artistRank map[string]int
	recentRank map[string]int
}

type playsSnapshot struct {
	counts map[string]map[string]int // user -> track -> plays
}

type mostPlayedOrder struct {
	songs *songsSnapshot
	plays *playsSnapshot
	order []int // indexes into songs.byArtist
	rank  map[string]int
}

func NewLibraryCache(db *Store) *LibraryCache {
	c := &LibraryCache{db: db, memo: map[string]*mostPlayedOrder{}}
	c.songs = newReloadable(c.loadSongs)
	c.plays = newReloadable(c.loadPlays)
	return c
}

// Run maintains the cache until ctx ends. Attach the cache to the store with
// Store.Library before or after starting Run; reads fall back until ready.
func (c *LibraryCache) Run(ctx context.Context) {
	var wg sync.WaitGroup
	wg.Add(2)
	go func() { defer wg.Done(); c.songs.run(ctx, "songs") }()
	go func() { defer wg.Done(); c.plays.run(ctx, "plays") }()
	for ctx.Err() == nil {
		if err := c.listen(ctx); err != nil && ctx.Err() == nil {
			slog.ErrorContext(ctx, "library cache listener reconnecting", "component", "library_cache", "error", err)
		}
		c.listening.Store(false)
		select {
		case <-ctx.Done():
		case <-time.After(time.Second):
		}
	}
	wg.Wait()
}

func (c *LibraryCache) listen(ctx context.Context) error {
	cfg := c.db.Pool.Config().ConnConfig.Copy()
	cfg.ConnectTimeout = 5 * time.Second
	cfg.Tracer = nil
	conn, err := pgx.ConnectConfig(ctx, cfg)
	if err != nil {
		return err
	}
	defer func() {
		closeCtx, cancel := context.WithTimeout(context.Background(), time.Second)
		defer cancel()
		_ = conn.Close(closeCtx)
	}()
	if _, err := conn.Exec(ctx, "LISTEN "+librarySongsChannel+"; LISTEN "+libraryPlaysChannel); err != nil {
		return err
	}
	// Anything may have changed while we were not listening.
	c.songs.invalidate()
	c.plays.invalidate()
	c.listening.Store(true)
	for {
		n, err := conn.WaitForNotification(ctx)
		if err != nil {
			return err
		}
		switch n.Channel {
		case librarySongsChannel:
			c.songs.invalidate()
		case libraryPlaysChannel:
			c.plays.invalidate()
		}
	}
}

// SongsChanged and PlaysChanged must be called after this process commits a
// write, before the response is sent.
func (c *LibraryCache) SongsChanged() { c.songs.invalidate() }
func (c *LibraryCache) PlaysChanged() { c.plays.invalidate() }

func (c *LibraryCache) loadSongs(ctx context.Context) (*songsSnapshot, error) {
	rows, err := c.db.Pool.Query(ctx, `
		select id, name, artist_name, album_name, album_art, duration, yt_video_id,
		       lyrics, synced_lyrics, is_lyrics_available, coalesce(is_available, false), created_at,
		       row_number() over (order by created_at desc, id asc) - 1
		from songs
		where deleted_at is null
		order by artist_name asc, id asc
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	snap := &songsSnapshot{artistRank: map[string]int{}, recentRank: map[string]int{}}
	var recentPositions []int64
	for rows.Next() {
		var song types.LibrarySong
		var lyrics, syncedLyrics sql.NullString
		var isLyrics sql.NullBool
		var recent int64
		if err := rows.Scan(&song.TrackID, &song.Name, &song.ArtistName, &song.AlbumName, &song.AlbumArt, &song.Duration, &song.YoutubeVideoID,
			&lyrics, &syncedLyrics, &isLyrics, &song.IsAvailable, &song.CreatedAt, &recent); err != nil {
			return nil, err
		}
		song.Lyrics = lyrics.String
		song.SyncedLyrics = syncedLyrics.String
		if isLyrics.Valid {
			value := isLyrics.Bool
			song.IsLyricsAvailable = &value
		}
		if song.IsAvailable {
			song.AudioURL = librarySongAudioURL(song.TrackID, song.YoutubeVideoID)
		}
		snap.artistRank[song.TrackID] = len(snap.byArtist)
		snap.byArtist = append(snap.byArtist, song)
		recentPositions = append(recentPositions, recent)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	snap.byRecent = make([]int, len(snap.byArtist))
	for i, position := range recentPositions {
		if position < 0 || int(position) >= len(snap.byRecent) {
			return nil, errors.New("library cache: recent rank out of range")
		}
		snap.byRecent[position] = i
		snap.recentRank[snap.byArtist[i].TrackID] = int(position)
	}
	return snap, nil
}

func (c *LibraryCache) loadPlays(ctx context.Context) (*playsSnapshot, error) {
	rows, err := c.db.Pool.Query(ctx, `select user_id, track_id, play_count from user_song_plays`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	snap := &playsSnapshot{counts: map[string]map[string]int{}}
	for rows.Next() {
		var userID, trackID string
		var count int
		if err := rows.Scan(&userID, &trackID, &count); err != nil {
			return nil, err
		}
		user := snap.counts[userID]
		if user == nil {
			user = map[string]int{}
			snap.counts[userID] = user
		}
		user[trackID] = count
	}
	return snap, rows.Err()
}

func (c *LibraryCache) page(ctx context.Context, opts FetchSongsOptions, limit int) (types.SongsPageResponse, bool) {
	if !c.listening.Load() {
		metrics.ObserveLibraryCache("not_listening")
		return types.SongsPageResponse{}, false
	}
	songs, ok := c.songs.fresh(ctx)
	if !ok {
		metrics.ObserveLibraryCache("stale")
		return types.SongsPageResponse{}, false
	}
	plays, ok := c.plays.fresh(ctx)
	if !ok {
		metrics.ObserveLibraryCache("stale")
		return types.SongsPageResponse{}, false
	}
	userPlays := plays.counts[opts.UserID]

	var order []int // nil means identity over byArtist
	var rank map[string]int
	switch opts.Sort {
	case SongSortMostPlayed:
		mp := c.mostPlayed(opts.UserID, songs, plays)
		order, rank = mp.order, mp.rank
	case SongSortRecentlyAdded:
		order, rank = songs.byRecent, songs.recentRank
	default:
		rank = songs.artistRank
	}

	start := 0
	if cursor := opts.Cursor; cursor != nil {
		position, found := rank[cursor.TrackID]
		if !found {
			metrics.ObserveLibraryCache("cursor_miss")
			return types.SongsPageResponse{}, false
		}
		song := songs.byArtist[position]
		if order != nil {
			song = songs.byArtist[order[position]]
		}
		// The SQL path compares cursor values, not positions. Only use the
		// position when the cursor still describes the snapshot's row.
		matches := song.ArtistName == cursor.ArtistName
		switch opts.Sort {
		case SongSortMostPlayed:
			matches = matches && userPlays[song.TrackID] == cursor.PlayCount
		case SongSortRecentlyAdded:
			matches = cursor.CreatedAt != nil && song.CreatedAt.Equal(*cursor.CreatedAt)
		}
		if !matches {
			metrics.ObserveLibraryCache("cursor_miss")
			return types.SongsPageResponse{}, false
		}
		start = position + 1
	}

	total := len(songs.byArtist)
	end := min(start+limit, total)
	out := make([]types.LibrarySong, 0, max(end-start, 0))
	for position := start; position < end; position++ {
		index := position
		if order != nil {
			index = order[position]
		}
		song := songs.byArtist[index]
		song.PlayCount = userPlays[song.TrackID]
		out = append(out, song)
	}
	hasMore := end < total
	var nextCursor *types.SongCursor
	if hasMore && len(out) > 0 {
		last := out[len(out)-1]
		nextCursor = &types.SongCursor{ArtistName: last.ArtistName, TrackID: last.TrackID, PlayCount: last.PlayCount}
		if opts.Sort == SongSortRecentlyAdded {
			createdAt := last.CreatedAt
			nextCursor.CreatedAt = &createdAt
		}
	}
	metrics.ObserveLibraryCache("hit")
	return types.SongsPageResponse{
		Songs:        out,
		NextCursor:   nextCursor,
		HasMore:      hasMore,
		PageRevision: types.SongPageRevision(out),
	}, true
}

// mostPlayed matches ORDER BY play_count DESC, artist_name, id: a stable sort
// by play count over the artist order.
func (c *LibraryCache) mostPlayed(userID string, songs *songsSnapshot, plays *playsSnapshot) *mostPlayedOrder {
	c.memoMu.Lock()
	defer c.memoMu.Unlock()
	if mp := c.memo[userID]; mp != nil && mp.songs == songs && mp.plays == plays {
		return mp
	}
	counts := plays.counts[userID]
	order := make([]int, len(songs.byArtist))
	for i := range order {
		order[i] = i
	}
	slices.SortStableFunc(order, func(a, b int) int {
		return counts[songs.byArtist[b].TrackID] - counts[songs.byArtist[a].TrackID]
	})
	rank := make(map[string]int, len(order))
	for position, index := range order {
		rank[songs.byArtist[index].TrackID] = position
	}
	mp := &mostPlayedOrder{songs: songs, plays: plays, order: order, rank: rank}
	c.memo[userID] = mp
	return mp
}

// reloadable holds a value that is reloaded in the background whenever it is
// invalidated. Readers only receive a value loaded after their read began
// waiting on every invalidation that preceded it.
type reloadable[T any] struct {
	load func(context.Context) (T, error)
	kick chan struct{}

	mu      sync.Mutex
	value   T
	want    uint64
	have    uint64 // generation the current value reflects
	failing bool
	changed chan struct{} // closed after each successful load
}

func newReloadable[T any](load func(context.Context) (T, error)) *reloadable[T] {
	// want starts ahead of have: nothing is fresh before the first load.
	return &reloadable[T]{load: load, kick: make(chan struct{}, 1), want: 1, changed: make(chan struct{})}
}

func (r *reloadable[T]) invalidate() {
	r.mu.Lock()
	r.want++
	r.mu.Unlock()
	select {
	case r.kick <- struct{}{}:
	default:
	}
}

func (r *reloadable[T]) fresh(ctx context.Context) (T, bool) {
	var zero T
	r.mu.Lock()
	target := r.want
	if r.have >= target {
		value := r.value
		r.mu.Unlock()
		return value, true
	}
	if r.failing {
		r.mu.Unlock()
		return zero, false
	}
	timer := time.NewTimer(libraryFreshnessWait)
	defer timer.Stop()
	for r.have < target {
		changed := r.changed
		r.mu.Unlock()
		select {
		case <-changed:
		case <-timer.C:
			return zero, false
		case <-ctx.Done():
			return zero, false
		}
		r.mu.Lock()
	}
	value := r.value
	r.mu.Unlock()
	return value, true
}

func (r *reloadable[T]) run(ctx context.Context, name string) {
	backoff := 100 * time.Millisecond
	for {
		select {
		case <-ctx.Done():
			return
		case <-r.kick:
		}
		for {
			r.mu.Lock()
			target := r.want
			current := r.have >= target
			r.mu.Unlock()
			if current {
				break
			}
			// The target is captured before querying, so a write committed after
			// this point bumps want past it and forces another load.
			loadCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
			started := time.Now()
			value, err := r.load(loadCtx)
			cancel()
			if err != nil {
				if ctx.Err() != nil {
					return
				}
				r.mu.Lock()
				r.failing = true
				r.mu.Unlock()
				slog.ErrorContext(ctx, "library cache reload failed", "component", "library_cache", "part", name, "error", err)
				select {
				case <-ctx.Done():
					return
				case <-time.After(backoff):
				}
				backoff = min(backoff*2, 5*time.Second)
				continue
			}
			backoff = 100 * time.Millisecond
			metrics.ObserveLibraryCacheReload(name, time.Since(started))
			r.mu.Lock()
			r.value = value
			r.have = target
			r.failing = false
			close(r.changed)
			r.changed = make(chan struct{})
			r.mu.Unlock()
		}
	}
}
