//go:build integration

package store_test

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"orpheus-web/internal/store"
	"orpheus-web/internal/testutil"
	"orpheus-web/internal/types"
)

func TestSongOutboxTransactions(t *testing.T) {
	db, url, _ := testutil.Postgres(t)
	reset := func(t *testing.T) {
		t.Helper()
		if _, err := db.Pool.Exec(t.Context(), `TRUNCATE songs, yt_music_videos CASCADE`); err != nil {
			t.Fatal(err)
		}
	}
	count := func(t *testing.T, action string) int {
		t.Helper()
		var n int
		if err := db.Pool.QueryRow(t.Context(), `SELECT count(*) FROM song_job_outbox WHERE action=$1`, action).Scan(&n); err != nil {
			t.Fatal(err)
		}
		return n
	}
	t.Run("all producers and no-op edits", func(t *testing.T) {
		reset(t)
		video := types.YouTubeVideo{ID: "video", Title: "Video", PublishedAt: "2024-01-01"}
		song := types.SongUpsert{TrackID: "track", Name: "Track", ArtistName: "Artist", AlbumName: "Album", Duration: "PT1S", YoutubeVideoID: video.ID, ReleaseDate: "2024-01-01", ReleaseYear: "2024"}
		if err := db.UpsertSongAndVideo(t.Context(), song, video); err != nil {
			t.Fatal(err)
		}
		if count(t, store.ProcessSongAction) != 1 {
			t.Fatal("import did not schedule processing")
		}
		metadata := store.SongMetadataUpdate{Name: "Track", ArtistName: "Artist", AlbumName: "Album"}
		response, err := db.UpdateSongMetadata(t.Context(), "user", "track", metadata)
		if err != nil {
			t.Fatal(err)
		}
		if response.FileUpdateQueued || count(t, store.UpdateSongFilesAction) != 0 {
			t.Fatal("unchanged metadata scheduled work")
		}
		metadata.Name = "Renamed"
		response, err = db.UpdateSongMetadata(t.Context(), "user", "track", metadata)
		if err != nil || !response.FileUpdateQueued {
			t.Fatalf("metadata edit: %+v, %v", response, err)
		}
		if err := db.UpdateAlbumArt(t.Context(), "track", "cover.jpg"); err != nil {
			t.Fatal(err)
		}
		if err := db.UpdateAlbumArt(t.Context(), "track", "cover.jpg"); err != nil {
			t.Fatal(err)
		}
		if count(t, store.UpdateSongFilesAction) != 2 {
			t.Fatal("artwork no-op scheduled work or change was missed")
		}
		if err := db.UpdateLyrics(t.Context(), "track", "plain", "[00:01]synced"); err != nil {
			t.Fatal(err)
		}
		if err := db.UpdateLyrics(t.Context(), "track", "plain", "[00:01]synced"); err != nil {
			t.Fatal(err)
		}
		if count(t, store.UpdateSongLyricsAction) != 1 {
			t.Fatal("lyrics no-op scheduled work or change was missed")
		}
		video.ID = "replacement"
		if _, err := db.ReplaceAudioSource(t.Context(), "user", "track", video); err != nil {
			t.Fatal(err)
		}
		if _, err := db.RegenerateSong(t.Context(), "user", "track"); err != nil {
			t.Fatal(err)
		}
		if _, err := db.ScheduleSong(t.Context(), "track", store.ProcessSongAction); err != nil {
			t.Fatal(err)
		}
		if count(t, store.ProcessSongAction) != 4 {
			t.Fatal("source, regeneration, or CLI job missing")
		}
	})
	t.Run("enqueue failure rolls back song and video", func(t *testing.T) {
		reset(t)
		if _, err := db.Pool.Exec(t.Context(), `ALTER TABLE song_job_outbox ADD CONSTRAINT reject_test_job CHECK (song_id <> 'rollback')`); err != nil {
			t.Fatal(err)
		}
		defer db.Pool.Exec(context.Background(), `ALTER TABLE song_job_outbox DROP CONSTRAINT reject_test_job`)
		video := types.YouTubeVideo{ID: "rollback-video", Title: "Video", PublishedAt: "2024-01-01"}
		song := types.SongUpsert{TrackID: "rollback", Name: "Rollback", ArtistName: "Artist", AlbumName: "Album", Duration: "PT1S", YoutubeVideoID: video.ID, ReleaseDate: "2024-01-01", ReleaseYear: "2024"}
		if err := db.UpsertSongAndVideo(t.Context(), song, video); err == nil {
			t.Fatal("expected enqueue failure")
		}
		var n int
		if err := db.Pool.QueryRow(t.Context(), `SELECT (SELECT count(*) FROM songs)+(SELECT count(*) FROM yt_music_videos)+(SELECT count(*) FROM song_job_outbox)`).Scan(&n); err != nil {
			t.Fatal(err)
		}
		if n != 0 {
			t.Fatalf("partial save survived rollback: %d rows", n)
		}
	})
	t.Run("notifications follow commit and rollback", func(t *testing.T) {
		reset(t)
		testutil.SeedSong(t, db, "notify")
		listener, err := pgx.Connect(t.Context(), url)
		if err != nil {
			t.Fatal(err)
		}
		defer listener.Close(context.Background())
		if _, err := listener.Exec(t.Context(), `LISTEN song_jobs_ready`); err != nil {
			t.Fatal(err)
		}
		tx, err := db.Pool.Begin(t.Context())
		if err != nil {
			t.Fatal(err)
		}
		if _, err := tx.Exec(t.Context(), `INSERT INTO song_job_outbox(song_id,action) VALUES('notify','update-song-lyrics')`); err != nil {
			t.Fatal(err)
		}
		if err := tx.Rollback(t.Context()); err != nil {
			t.Fatal(err)
		}
		wait, cancel := context.WithTimeout(t.Context(), 150*time.Millisecond)
		_, err = listener.WaitForNotification(wait)
		cancel()
		if !errors.Is(err, context.DeadlineExceeded) {
			t.Fatalf("rollback emitted notification: %v", err)
		}
		if _, err := db.ScheduleSong(t.Context(), "notify", store.UpdateSongLyricsAction); err != nil {
			t.Fatal(err)
		}
		wait, cancel = context.WithTimeout(t.Context(), time.Second)
		defer cancel()
		if _, err := listener.WaitForNotification(wait); err != nil {
			t.Fatal(err)
		}
	})
	t.Run("concurrent claims and stale lease fencing", func(t *testing.T) {
		reset(t)
		testutil.SeedSong(t, db, "claims")
		for range 8 {
			if _, err := db.ScheduleSong(t.Context(), "claims", store.UpdateSongFilesAction); err != nil {
				t.Fatal(err)
			}
		}
		jobs := make(chan *store.OutboxJob, 8)
		failures := make(chan error, 8)
		var wg sync.WaitGroup
		for range 8 {
			wg.Add(1)
			go func() {
				defer wg.Done()
				job, err := db.ClaimSongJob(t.Context(), time.Minute)
				if err != nil {
					failures <- err
					return
				}
				jobs <- job
			}()
		}
		wg.Wait()
		close(jobs)
		close(failures)
		for err := range failures {
			t.Fatal(err)
		}
		seen := map[string]bool{}
		var old store.OutboxJob
		for job := range jobs {
			if job == nil || seen[job.ID] {
				t.Fatal("claim was empty or duplicated")
			}
			seen[job.ID] = true
			old = *job
		}
		if len(seen) != 8 {
			t.Fatal("some jobs were not claimed")
		}
		if _, err := db.Pool.Exec(t.Context(), `UPDATE song_job_outbox SET lease_until=now()-interval '1 second' WHERE id=$1`, old.ID); err != nil {
			t.Fatal(err)
		}
		fresh, err := db.ClaimSongJob(t.Context(), time.Minute)
		if err != nil || fresh == nil || fresh.ID != old.ID {
			t.Fatalf("expired claim not recovered: %+v %v", fresh, err)
		}
		if ok, err := db.MarkSongJobPublished(t.Context(), old); err != nil || ok {
			t.Fatalf("stale publication changed newer claim: %t %v", ok, err)
		}
		if ok, err := db.RetrySongJob(t.Context(), old, time.Second, errors.New("old")); err != nil || ok {
			t.Fatalf("stale retry changed newer claim: %t %v", ok, err)
		}
		if _, err := db.Pool.Exec(t.Context(), `UPDATE song_job_outbox SET completed_at=now() WHERE id=$1`, fresh.ID); err != nil {
			t.Fatal(err)
		}
		if ok, err := db.MarkSongJobPublished(t.Context(), *fresh); err != nil || !ok {
			t.Fatalf("publication failed after fast completion: %t %v", ok, err)
		}
		var completed bool
		if err := db.Pool.QueryRow(t.Context(), `SELECT completed_at IS NOT NULL FROM song_job_outbox WHERE id=$1`, fresh.ID).Scan(&completed); err != nil || !completed {
			t.Fatal("publication erased completion")
		}
	})
	t.Run("retention preserves unfinished work", func(t *testing.T) {
		reset(t)
		testutil.SeedSong(t, db, "retention")
		for range 2 {
			if _, err := db.ScheduleSong(t.Context(), "retention", store.ProcessSongAction); err != nil {
				t.Fatal(err)
			}
		}
		if _, err := db.Pool.Exec(t.Context(), `UPDATE song_job_outbox SET published_at=now()-interval '8 days'`); err != nil {
			t.Fatal(err)
		}
		if _, err := db.Pool.Exec(t.Context(), `UPDATE song_job_outbox SET completed_at=now()-interval '8 days' WHERE id=(SELECT id FROM song_job_outbox LIMIT 1)`); err != nil {
			t.Fatal(err)
		}
		cleanupID, err := db.ScheduleSong(t.Context(), "retention", store.ProcessSongAction)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := db.Pool.Exec(t.Context(), `UPDATE song_job_outbox SET completed_at=now()-interval '8 days' WHERE id=$1`, cleanupID); err != nil {
			t.Fatal(err)
		}
		if _, err := db.Pool.Exec(t.Context(), `INSERT INTO song_file_cleanup(song_id,relative_path) VALUES('retention','old.m4a')`); err != nil {
			t.Fatal(err)
		}
		if err := db.PruneSongJobs(t.Context(), 7*24*time.Hour); err != nil {
			t.Fatal(err)
		}
		if count(t, store.ProcessSongAction) != 3 {
			t.Fatal("completion receipt with pending cleanup was pruned")
		}
		if _, err := db.Pool.Exec(t.Context(), `DELETE FROM song_file_cleanup`); err != nil {
			t.Fatal(err)
		}
		if err := db.PruneSongJobs(t.Context(), 7*24*time.Hour); err != nil {
			t.Fatal(err)
		}
		if count(t, store.ProcessSongAction) != 1 {
			t.Fatal("unfinished job was pruned")
		}
	})
}
