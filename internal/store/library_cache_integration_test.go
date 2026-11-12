//go:build integration

package store_test

import (
	"context"
	"fmt"
	"reflect"
	"testing"
	"time"

	promtest "github.com/prometheus/client_golang/prometheus/testutil"

	"orpheus-web/internal/metrics"
	"orpheus-web/internal/store"
	"orpheus-web/internal/testutil"
	"orpheus-web/internal/types"
)

func cacheHits() float64 {
	return promtest.ToFloat64(metrics.LibraryCacheRequests.WithLabelValues("hit"))
}

// startLibraryCache returns a cached store and an uncached store sharing one pool.
func startLibraryCache(t *testing.T, db *store.Store) (*store.Store, *store.Store) {
	t.Helper()
	cached := &store.Store{Pool: db.Pool}
	cached.Library = store.NewLibraryCache(cached)
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() { defer close(done); cached.Library.Run(ctx) }()
	t.Cleanup(func() { cancel(); <-done })
	waitForCacheHit(t, cached)
	return cached, &store.Store{Pool: db.Pool}
}

func waitForCacheHit(t *testing.T, cached *store.Store) {
	t.Helper()
	testutil.Eventually(t, 10*time.Second, func() bool {
		before := cacheHits()
		if _, err := cached.FetchSongsPage(t.Context(), store.FetchSongsOptions{UserID: "user", Limit: 1}); err != nil {
			t.Fatal(err)
		}
		return cacheHits() > before
	})
}

func seedLibrary(t *testing.T, db *store.Store, total int) {
	t.Helper()
	ctx := t.Context()
	if _, err := db.Pool.Exec(ctx, `INSERT INTO "user"(id,name,email,email_verified,created_at,updated_at) VALUES('user','User','u@example.test',true,now(),now()),('other','Other','o@example.test',true,now(),now())`); err != nil {
		t.Fatal(err)
	}
	for i := range total {
		id := fmt.Sprintf("song-%02d", i)
		testutil.SeedSong(t, db, id)
		// Mixed case and repeated names exercise collation and id tie-breaks.
		artist := []string{"alpha", "Beta", "beta", "Älpha", "Zed"}[i%5]
		if _, err := db.Pool.Exec(ctx, `UPDATE songs SET artist_name = $2, lyrics = 'words ' || $1, created_at = timestamp '2024-01-01' + make_interval(days => $3) WHERE id = $1`,
			id, artist, i%4); err != nil {
			t.Fatal(err)
		}
		for range i % 3 {
			if _, err := db.RecordSongPlay(ctx, "user", id); err != nil {
				t.Fatal(err)
			}
		}
		if i%4 == 0 {
			if _, err := db.RecordSongPlay(ctx, "other", id); err != nil {
				t.Fatal(err)
			}
		}
	}
	if _, err := db.Pool.Exec(ctx, `UPDATE songs SET is_available = false WHERE id = 'song-03'`); err != nil {
		t.Fatal(err)
	}
	testutil.SeedSong(t, db, "deleted")
	if _, err := db.DeleteSong(ctx, "deleted"); err != nil {
		t.Fatal(err)
	}
}

func allPages(t *testing.T, db *store.Store, userID string, sort store.SongSort, limit int) []types.SongsPageResponse {
	t.Helper()
	var pages []types.SongsPageResponse
	var cursor *types.SongCursor
	for {
		page, err := db.FetchSongsPage(t.Context(), store.FetchSongsOptions{UserID: userID, Limit: limit, Sort: sort, Cursor: cursor})
		if err != nil {
			t.Fatal(err)
		}
		pages = append(pages, page)
		if !page.HasMore {
			return pages
		}
		cursor = page.NextCursor
	}
}

func TestLibraryCacheMatchesSQL(t *testing.T) {
	db, _, _ := testutil.Postgres(t)
	seedLibrary(t, db, 27)
	cached, plain := startLibraryCache(t, db)

	for _, userID := range []string{"user", "other", "nobody"} {
		for _, sort := range []store.SongSort{store.SongSortArtist, store.SongSortMostPlayed, store.SongSortRecentlyAdded} {
			for _, limit := range []int{4, 100} {
				t.Run(fmt.Sprintf("%s/%s/%d", userID, sort, limit), func(t *testing.T) {
					before := cacheHits()
					got := allPages(t, cached, userID, sort, limit)
					hits := cacheHits() - before
					want := allPages(t, plain, userID, sort, limit)
					if !reflect.DeepEqual(got, want) {
						t.Fatalf("cached pages differ from SQL\ncached: %+v\nsql:    %+v", got, want)
					}
					if int(hits) != len(got) {
						t.Fatalf("cache served %v of %d pages", hits, len(got))
					}
				})
			}
		}
	}
}

func TestLibraryCacheFreshness(t *testing.T) {
	db, _, _ := testutil.Postgres(t)
	seedLibrary(t, db, 6)
	cached, plain := startLibraryCache(t, db)
	ctx := t.Context()
	first := func(sort store.SongSort) types.LibrarySong {
		page, err := cached.FetchSongsPage(ctx, store.FetchSongsOptions{UserID: "user", Limit: 1, Sort: sort})
		if err != nil {
			t.Fatal(err)
		}
		return page.Songs[0]
	}

	t.Run("own writes are visible immediately", func(t *testing.T) {
		for range 5 {
			if _, err := cached.RecordSongPlay(ctx, "user", "song-04"); err != nil {
				t.Fatal(err)
			}
		}
		if song := first(store.SongSortMostPlayed); song.TrackID != "song-04" || song.PlayCount != 6 {
			t.Fatalf("most played after own write = %s (%d plays)", song.TrackID, song.PlayCount)
		}
	})

	t.Run("other writers arrive through NOTIFY", func(t *testing.T) {
		// Simulates a media worker or another replica writing directly.
		if _, err := plain.Pool.Exec(ctx, `UPDATE songs SET artist_name = '1 first' WHERE id = 'song-05'`); err != nil {
			t.Fatal(err)
		}
		testutil.Eventually(t, 5*time.Second, func() bool { return first(store.SongSortArtist).TrackID == "song-05" })
		if _, err := plain.Pool.Exec(ctx, `UPDATE user_song_plays SET play_count = 100 WHERE user_id = 'user' AND track_id = 'song-01'`); err != nil {
			t.Fatal(err)
		}
		testutil.Eventually(t, 5*time.Second, func() bool { return first(store.SongSortMostPlayed).TrackID == "song-01" })
	})

	t.Run("listener loss never serves stale data", func(t *testing.T) {
		if _, err := plain.Pool.Exec(ctx, `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE query LIKE 'LISTEN library_%' AND pid <> pg_backend_pid()`); err != nil {
			t.Fatal(err)
		}
		if _, err := plain.Pool.Exec(ctx, `UPDATE songs SET artist_name = '0 first' WHERE id = 'song-02'`); err != nil {
			t.Fatal(err)
		}
		// Whether served by fallback SQL or by the reconnected cache, the
		// result must be fresh as soon as the write is visible to readers.
		testutil.Eventually(t, 5*time.Second, func() bool { return first(store.SongSortArtist).TrackID == "song-02" })
		waitForCacheHit(t, cached)
		if song := first(store.SongSortArtist); song.TrackID != "song-02" {
			t.Fatalf("after reconnect first artist song = %s", song.TrackID)
		}
	})

	t.Run("stale cursor falls back to SQL", func(t *testing.T) {
		page, err := cached.FetchSongsPage(ctx, store.FetchSongsOptions{UserID: "user", Limit: 2, Sort: store.SongSortArtist})
		if err != nil {
			t.Fatal(err)
		}
		cursor := page.NextCursor
		if _, err := cached.DeleteSong(ctx, cursor.TrackID); err != nil {
			t.Fatal(err)
		}
		got, err := cached.FetchSongsPage(ctx, store.FetchSongsOptions{UserID: "user", Limit: 100, Sort: store.SongSortArtist, Cursor: cursor})
		if err != nil {
			t.Fatal(err)
		}
		want, err := plain.FetchSongsPage(ctx, store.FetchSongsOptions{UserID: "user", Limit: 100, Sort: store.SongSortArtist, Cursor: cursor})
		if err != nil {
			t.Fatal(err)
		}
		if !reflect.DeepEqual(got, want) {
			t.Fatalf("cursor after deletion\ncached: %+v\nsql:    %+v", got, want)
		}
	})
}
