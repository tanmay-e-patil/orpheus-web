//go:build integration

package store_test

import (
	"errors"
	"fmt"
	"testing"

	"github.com/jackc/pgx/v5"

	"orpheus-web/internal/store"
	"orpheus-web/internal/testutil"
	"orpheus-web/internal/types"
)

func TestRecordSongPlay(t *testing.T) {
	db, _, _ := testutil.Postgres(t)
	ctx := t.Context()
	if _, err := db.Pool.Exec(ctx, `INSERT INTO "user"(id,name,email,email_verified,created_at,updated_at) VALUES('user','User','u@example.test',true,now(),now())`); err != nil {
		t.Fatal(err)
	}
	testutil.SeedSong(t, db, "ready")
	testutil.SeedSong(t, db, "pending")
	testutil.SeedSong(t, db, "gone")
	if _, err := db.Pool.Exec(ctx, `UPDATE songs SET is_available = false WHERE id = 'pending'`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.DeleteSong(ctx, "gone"); err != nil {
		t.Fatal(err)
	}

	for want := 1; want <= 2; want++ {
		play, err := db.RecordSongPlay(ctx, "user", "ready")
		if err != nil {
			t.Fatal(err)
		}
		if play.TrackID != "ready" || play.PlayCount != want || play.LastPlayedAt.IsZero() {
			t.Fatalf("play %d = %+v", want, play)
		}
	}
	if _, err := db.RecordSongPlay(ctx, "user", "pending"); !errors.Is(err, store.ErrSongUnavailable) {
		t.Fatalf("unavailable song error = %v", err)
	}
	for _, id := range []string{"gone", "missing"} {
		if _, err := db.RecordSongPlay(ctx, "user", id); !errors.Is(err, pgx.ErrNoRows) {
			t.Fatalf("%s song error = %v", id, err)
		}
	}
	var rows int
	if err := db.Pool.QueryRow(ctx, `SELECT count(*) FROM user_song_plays`).Scan(&rows); err != nil {
		t.Fatal(err)
	}
	if rows != 1 {
		t.Fatalf("user_song_plays rows = %d, want 1", rows)
	}
}

func TestFetchSongsPagePaginatesEverySort(t *testing.T) {
	db, _, _ := testutil.Postgres(t)
	ctx := t.Context()
	if _, err := db.Pool.Exec(ctx, `INSERT INTO "user"(id,name,email,email_verified,created_at,updated_at) VALUES('user','User','u@example.test',true,now(),now())`); err != nil {
		t.Fatal(err)
	}
	const total = 23
	for i := range total {
		id := fmt.Sprintf("song-%02d", i)
		testutil.SeedSong(t, db, id)
		// Repeated artist names and timestamps exercise the id tie-breakers.
		if _, err := db.Pool.Exec(ctx, `UPDATE songs SET artist_name = $2, created_at = timestamp '2024-01-01' + make_interval(days => $3) WHERE id = $1`,
			id, fmt.Sprintf("Artist %d", i%4), i%5); err != nil {
			t.Fatal(err)
		}
		for range i % 3 {
			if _, err := db.RecordSongPlay(ctx, "user", id); err != nil {
				t.Fatal(err)
			}
		}
	}
	testutil.SeedSong(t, db, "deleted")
	if _, err := db.DeleteSong(ctx, "deleted"); err != nil {
		t.Fatal(err)
	}

	for _, sort := range []store.SongSort{store.SongSortArtist, store.SongSortMostPlayed, store.SongSortRecentlyAdded} {
		t.Run(string(sort), func(t *testing.T) {
			all, err := db.FetchSongsPage(ctx, store.FetchSongsOptions{UserID: "user", Limit: 100, Sort: sort})
			if err != nil {
				t.Fatal(err)
			}
			if len(all.Songs) != total || all.HasMore {
				t.Fatalf("single page: %d songs, hasMore=%v", len(all.Songs), all.HasMore)
			}
			var paged []types.LibrarySong
			var cursor *types.SongCursor
			for {
				page, err := db.FetchSongsPage(ctx, store.FetchSongsOptions{UserID: "user", Limit: 5, Sort: sort, Cursor: cursor})
				if err != nil {
					t.Fatal(err)
				}
				paged = append(paged, page.Songs...)
				if !page.HasMore {
					break
				}
				cursor = page.NextCursor
			}
			if len(paged) != total {
				t.Fatalf("paged %d songs, want %d", len(paged), total)
			}
			for i := range paged {
				if paged[i].TrackID != all.Songs[i].TrackID {
					t.Fatalf("position %d: paged %s, single page %s", i, paged[i].TrackID, all.Songs[i].TrackID)
				}
			}
		})
	}
}
