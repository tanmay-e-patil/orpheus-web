//go:build integration

package store_test

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"orpheus-web/internal/http/handlers"
	"orpheus-web/internal/store"
	"orpheus-web/internal/testutil"
	"orpheus-web/internal/types"
)

func TestSongDeletion(t *testing.T) {
	db, _, _ := testutil.Postgres(t)
	reset := func(t *testing.T) {
		t.Helper()
		if _, err := db.Pool.Exec(t.Context(), `TRUNCATE songs,yt_music_videos,"user" CASCADE`); err != nil {
			t.Fatal(err)
		}
		testutil.SeedSong(t, db, "deleted")
	}
	t.Run("atomic scheduling, idempotence, hidden reads and mutation guards", func(t *testing.T) {
		reset(t)
		ctx := t.Context()
		if _, err := db.Pool.Exec(ctx, `INSERT INTO "user"(id,name,email,email_verified,created_at,updated_at) VALUES('user','User','u@example.test',true,now(),now()); UPDATE songs SET lyrics='plain',synced_lyrics='[00:01]line',is_lyrics_available=true WHERE id='deleted'`); err != nil {
			t.Fatal(err)
		}
		if _, err := db.RecordSongPlay(ctx, "user", "deleted"); err != nil {
			t.Fatal(err)
		}
		if _, err := db.Pool.Exec(ctx, `INSERT INTO song_file_cleanup VALUES('deleted','Old/Album/Old.m4a')`); err != nil {
			t.Fatal(err)
		}
		queued, err := db.DeleteSong(ctx, "deleted")
		if err != nil || !queued {
			t.Fatalf("delete: %v %v", queued, err)
		}
		queued, err = db.DeleteSong(ctx, "deleted")
		if err != nil || queued {
			t.Fatalf("repeat: %v %v", queued, err)
		}
		var jobs, plays, targets int
		var hidden bool
		if err := db.Pool.QueryRow(ctx, `SELECT (SELECT count(*) FROM song_job_outbox WHERE action='delete-song-files'),(SELECT count(*) FROM user_song_plays),(SELECT count(*) FROM song_file_cleanup),deleted_at IS NOT NULL AND NOT is_available AND lyrics='' AND synced_lyrics='' FROM songs WHERE id='deleted'`).Scan(&jobs, &plays, &targets, &hidden); err != nil {
			t.Fatal(err)
		}
		if jobs != 1 || plays != 0 || targets != 2 || !hidden {
			t.Fatalf("jobs=%d plays=%d targets=%d hidden=%v", jobs, plays, targets, hidden)
		}
		if _, _, err := db.FetchLibrarySong(ctx, "user", "deleted"); !errors.Is(err, pgx.ErrNoRows) {
			t.Fatalf("detail: %v", err)
		}
		if _, err := db.SongForAudio(ctx, "deleted"); !errors.Is(err, pgx.ErrNoRows) {
			t.Fatalf("audio: %v", err)
		}
		if _, err := db.RecordSongPlay(ctx, "user", "deleted"); !errors.Is(err, pgx.ErrNoRows) {
			t.Fatalf("play: %v", err)
		}
		if err := db.UpdateLyrics(ctx, "deleted", "new", "new"); !errors.Is(err, pgx.ErrNoRows) {
			t.Fatalf("lyrics: %v", err)
		}
		if err := db.UpdateAlbumArt(ctx, "deleted", "cover"); !errors.Is(err, pgx.ErrNoRows) {
			t.Fatalf("art: %v", err)
		}
		if _, err := db.RegenerateSong(ctx, "user", "deleted"); !errors.Is(err, pgx.ErrNoRows) {
			t.Fatalf("regenerate: %v", err)
		}
		if _, err := db.UpdateSongMetadata(ctx, "user", "deleted", store.SongMetadataUpdate{Name: "new"}); !errors.Is(err, pgx.ErrNoRows) {
			t.Fatalf("metadata: %v", err)
		}
		if _, err := db.ReplaceAudioSource(ctx, "user", "deleted", types.YouTubeVideo{ID: "new", Title: "new"}); !errors.Is(err, pgx.ErrNoRows) {
			t.Fatalf("source: %v", err)
		}
		if _, err := db.ScheduleSong(ctx, "deleted", store.ProcessSongAction); !errors.Is(err, pgx.ErrNoRows) {
			t.Fatalf("schedule: %v", err)
		}
		if songs, err := db.RedownloadSongs(ctx, store.RedownloadSongsFilter{IncludeAvailable: true}); err != nil || len(songs) != 0 {
			t.Fatalf("redownload: %v %v", songs, err)
		}
		if songs, err := db.SongsForAlbumRefresh(ctx, []string{"deleted"}); err != nil || len(songs) != 0 {
			t.Fatalf("refresh: %v %v", songs, err)
		}
		song := types.SongUpsert{TrackID: "deleted", Name: "deleted", ArtistName: "Artist", AlbumName: "Album", Duration: "PT1S", YoutubeVideoID: "new-video", ReleaseDate: "2024-01-01"}
		if err := db.UpsertSongAndVideo(ctx, song, types.YouTubeVideo{ID: "new-video", Title: "new"}); !errors.Is(err, store.ErrSongDeleted) {
			t.Fatalf("import: %v", err)
		}
		var videos int
		if err := db.Pool.QueryRow(ctx, `SELECT count(*) FROM yt_music_videos WHERE id='new-video'`).Scan(&videos); err != nil || videos != 0 {
			t.Fatalf("video rollback: %d %v", videos, err)
		}
		if _, err := db.Pool.Exec(ctx, `UPDATE song_job_outbox SET published_at=now() WHERE action='delete-song-files'`); err != nil {
			t.Fatal(err)
		}
		if count, oldest, err := db.DeletionBacklog(ctx); err != nil || count != 1 || oldest == nil {
			t.Fatalf("published deletion backlog: %d %v %v", count, oldest, err)
		}
		testutil.SeedSong(t, db, "live")
		// Exercise all cursor disjunctions, not just the first page.
		for _, sort := range []store.SongSort{store.SongSortArtist, store.SongSortMostPlayed, store.SongSortRecentlyAdded} {
			for _, cursor := range []*types.SongCursor{nil, {ArtistName: "", TrackID: "", PlayCount: 100}} {
				if sort == store.SongSortRecentlyAdded && cursor != nil {
					at := time.Now().Add(time.Hour)
					cursor.CreatedAt = &at
				}
				page, err := db.FetchSongsPage(ctx, store.FetchSongsOptions{UserID: "user", Sort: sort, Cursor: cursor})
				if err != nil {
					t.Fatal(err)
				}
				for _, song := range page.Songs {
					if song.TrackID == "deleted" {
						t.Fatalf("%s leaked tombstone", sort)
					}
				}
			}
		}
	})
	t.Run("enqueue failure rolls back deletion and cleanup", func(t *testing.T) {
		reset(t)
		if _, err := db.Pool.Exec(t.Context(), `ALTER TABLE song_job_outbox ADD CONSTRAINT reject_delete_test CHECK(action <> 'delete-song-files')`); err != nil {
			t.Fatal(err)
		}
		defer db.Pool.Exec(context.Background(), `ALTER TABLE song_job_outbox DROP CONSTRAINT reject_delete_test`)
		if _, err := db.DeleteSong(t.Context(), "deleted"); err == nil {
			t.Fatal("expected enqueue failure")
		}
		song, _, err := db.FetchLibrarySong(t.Context(), "user", "deleted")
		if err != nil || !song.IsAvailable {
			t.Fatalf("rollback: %+v %v", song, err)
		}
		var n int
		if err := db.Pool.QueryRow(t.Context(), `SELECT count(*) FROM song_file_cleanup`).Scan(&n); err != nil || n != 0 {
			t.Fatalf("cleanup leaked: %d %v", n, err)
		}
	})
	t.Run("concurrent requests schedule once", func(t *testing.T) {
		reset(t)
		var wg sync.WaitGroup
		errs := make(chan error, 8)
		for range 8 {
			wg.Add(1)
			go func() { defer wg.Done(); _, err := db.DeleteSong(t.Context(), "deleted"); errs <- err }()
		}
		wg.Wait()
		close(errs)
		for err := range errs {
			if err != nil {
				t.Fatal(err)
			}
		}
		var n int
		if err := db.Pool.QueryRow(t.Context(), `SELECT count(*) FROM song_job_outbox`).Scan(&n); err != nil || n != 1 {
			t.Fatalf("jobs=%d %v", n, err)
		}
	})
	t.Run("HTTP first repeated unknown and hidden audio", func(t *testing.T) {
		reset(t)
		for _, c := range []struct {
			id   string
			want int
		}{{"deleted", 202}, {"deleted", 204}, {"missing", 404}} {
			req := httptest.NewRequest(http.MethodDelete, "/api/songs/"+c.id, nil)
			req.SetPathValue("trackId", c.id)
			response := httptest.NewRecorder()
			handlers.DeleteSong(db)(response, req)
			if response.Code != c.want {
				t.Fatalf("delete %s: %d %s", c.id, response.Code, response.Body.String())
			}
		}
		req := httptest.NewRequest(http.MethodGet, "/api/songs/deleted/audio", nil)
		req.SetPathValue("trackId", "deleted")
		response := httptest.NewRecorder()
		handlers.StreamSongAudio(db, t.TempDir())(response, req)
		if response.Code != 404 {
			t.Fatalf("audio=%d", response.Code)
		}
	})
	t.Run("busy processing returns retryable HTTP error without partial deletion", func(t *testing.T) {
		reset(t)
		blocker, err := db.Pool.Begin(t.Context())
		if err != nil {
			t.Fatal(err)
		}
		defer blocker.Rollback(context.Background())
		if _, err := blocker.Exec(t.Context(), `SELECT id FROM songs WHERE id='deleted' FOR UPDATE`); err != nil {
			t.Fatal(err)
		}
		req := httptest.NewRequest(http.MethodDelete, "/api/songs/deleted", nil)
		req.SetPathValue("trackId", "deleted")
		response := httptest.NewRecorder()
		handlers.DeleteSong(db)(response, req)
		if response.Code != 503 || response.Header().Get("Retry-After") == "" {
			t.Fatalf("busy response: %d %s", response.Code, response.Body.String())
		}
		if err := blocker.Rollback(t.Context()); err != nil {
			t.Fatal(err)
		}
		song, _, err := db.FetchLibrarySong(t.Context(), "user", "deleted")
		if err != nil || !song.IsAvailable {
			t.Fatalf("busy request changed song: %+v %v", song, err)
		}
	})

}
