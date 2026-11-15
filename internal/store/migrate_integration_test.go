//go:build integration

package store_test

import (
	"context"
	"fmt"
	"io/fs"
	"net/url"
	"slices"
	"sync"
	"testing"
	"testing/fstest"
	"time"

	"github.com/jackc/pgx/v5"

	"orpheus-web/internal/store"
	"orpheus-web/internal/testutil"
)

func emptyDatabase(t *testing.T) *store.Store {
	t.Helper()
	admin, baseURL, _ := testutil.Postgres(t)
	name := pgx.Identifier{fmt.Sprintf("migrate_%d", time.Now().UnixNano())}.Sanitize()
	if _, err := admin.Pool.Exec(t.Context(), "CREATE DATABASE "+name); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if _, err := admin.Pool.Exec(context.Background(), "DROP DATABASE "+name+" WITH (FORCE)"); err != nil {
			t.Error(err)
		}
	})
	u, err := url.Parse(baseURL)
	if err != nil {
		t.Fatal(err)
	}
	u.Path = "/" + name[1:len(name)-1]
	db, err := store.Open(t.Context(), u.String())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(db.Close)
	return db
}

func appliedVersions(t *testing.T, db *store.Store) []string {
	t.Helper()
	rows, err := db.Pool.Query(t.Context(), `SELECT version FROM schema_migrations ORDER BY version`)
	if err != nil {
		t.Fatal(err)
	}
	versions, err := pgx.CollectRows(rows, pgx.RowTo[string])
	if err != nil {
		t.Fatal(err)
	}
	return versions
}

func tableExists(t *testing.T, db *store.Store, name string) bool {
	t.Helper()
	var exists bool
	if err := db.Pool.QueryRow(t.Context(), `SELECT to_regclass($1) IS NOT NULL`, name).Scan(&exists); err != nil {
		t.Fatal(err)
	}
	return exists
}

func TestMigrateRollsBackFailedMigration(t *testing.T) {
	db := emptyDatabase(t)
	ctx := t.Context()
	fsys := fstest.MapFS{
		"0000_gadgets.up.sql": {Data: []byte(`CREATE TABLE gadgets (id int);`)},
		"0001_widgets.up.sql": {Data: []byte("CREATE TABLE widgets (id int);\nINSERT INTO no_such_table VALUES (1);")},
	}
	if err := store.Migrate(ctx, db, fsys); err == nil {
		t.Fatal("migration with a failing statement succeeded")
	}
	if tableExists(t, db, "widgets") {
		t.Fatal("failed migration left its first statement applied")
	}
	if got := appliedVersions(t, db); !slices.Equal(got, []string{"0000_gadgets"}) {
		t.Fatalf("applied versions after failure = %v", got)
	}

	fsys["0001_widgets.up.sql"] = &fstest.MapFile{Data: []byte("CREATE TABLE widgets (id int);\nINSERT INTO widgets VALUES (1);")}
	if err := store.Migrate(ctx, db, fsys); err != nil {
		t.Fatalf("rerun after fix: %v", err)
	}
	if got := appliedVersions(t, db); !slices.Equal(got, []string{"0000_gadgets", "0001_widgets"}) {
		t.Fatalf("applied versions after rerun = %v", got)
	}
	var widgets int
	if err := db.Pool.QueryRow(ctx, `SELECT count(*) FROM widgets`).Scan(&widgets); err != nil || widgets != 1 {
		t.Fatalf("widgets=%d err=%v", widgets, err)
	}
}

func TestConcurrentMigrateOnFreshDatabase(t *testing.T) {
	db := emptyDatabase(t)
	fsys := fstest.MapFS{
		"0000_things.up.sql": {Data: []byte(`CREATE TABLE things (id int);`)},
		"0001_more.up.sql":   {Data: []byte(`CREATE TABLE more_things (id int);`)},
	}
	const runners = 8
	start := make(chan struct{})
	errs := make([]error, runners)
	var wg sync.WaitGroup
	for i := range runners {
		wg.Go(func() {
			<-start
			errs[i] = store.Migrate(t.Context(), db, fsys)
		})
	}
	close(start)
	wg.Wait()
	for i, err := range errs {
		if err != nil {
			t.Errorf("runner %d: %v", i, err)
		}
	}
	if got := appliedVersions(t, db); !slices.Equal(got, []string{"0000_things", "0001_more"}) {
		t.Fatalf("applied versions = %v", got)
	}
}

func migrationsBefore(t *testing.T, version string) fstest.MapFS {
	t.Helper()
	embedded := store.EmbeddedMigrations()
	entries, err := fs.Glob(embedded, "*.up.sql")
	if err != nil {
		t.Fatal(err)
	}
	selected := fstest.MapFS{}
	for _, entry := range entries {
		if entry >= version {
			continue
		}
		data, err := fs.ReadFile(embedded, entry)
		if err != nil {
			t.Fatal(err)
		}
		selected[entry] = &fstest.MapFile{Data: data}
	}
	return selected
}

func TestMigrationsConvertLegacyRows(t *testing.T) {
	db := emptyDatabase(t)
	ctx := t.Context()
	if err := store.Migrate(ctx, db, migrationsBefore(t, "0014")); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Pool.Exec(ctx, `
		INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
		VALUES ('owner', 'Owner', 'Owner@Example.com', true, '2024-01-01', '2024-01-01');
		INSERT INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at) VALUES
		  ('stale', 'owner', 'credential', 'owner', 'stale-hash', '2024-01-01', '2024-01-01'),
		  ('fresh', 'owner', 'credential', 'owner', 'fresh-hash', '2024-01-01', '2024-06-01');
		INSERT INTO yt_music_videos (id, title, thumbnail, channel_title, published_at) VALUES ('video', 'Video', '', 'Channel', '2024-01-01');
		INSERT INTO songs (id, name, artist_name, album_name, album_art, duration, yt_video_id, is_available, release_date, release_year, lyrics, is_lyrics_available) VALUES
		  ('placeholder', 'Placeholder', 'Artist', 'Album', '', 'PT1S', 'video', NULL, '1970-01-01', '1970', 'words', NULL),
		  ('dated', 'Dated', 'Artist', 'Album', '', 'PT1S', 'video', true, '2020-03-04', 'Unknown', '', true);
	`); err != nil {
		t.Fatal(err)
	}

	if err := db.MigrateUp(ctx); err != nil {
		t.Fatal(err)
	}

	var credentials int
	if err := db.Pool.QueryRow(ctx, `SELECT count(*) FROM account WHERE user_id = 'owner'`).Scan(&credentials); err != nil {
		t.Fatal(err)
	}
	if credentials != 1 {
		t.Fatalf("credential rows = %d, want 1", credentials)
	}
	if got, err := db.GetPasswordForUser(ctx, "owner"); err != nil || got != "fresh-hash" {
		t.Fatalf("kept password = %q, err = %v; want the most recently updated", got, err)
	}
	if user, err := db.GetUserByEmail(ctx, "owner@example.com"); err != nil || user.ID != "owner" {
		t.Fatalf("lookup by lower-case email = %+v, err = %v", user, err)
	}

	type songState struct {
		available     *bool
		releaseDate   *time.Time
		releaseYear   *int
		lyricsPresent *bool
	}
	song := func(id string) songState {
		var s songState
		if err := db.Pool.QueryRow(ctx, `SELECT is_available, release_date, release_year, is_lyrics_available FROM songs WHERE id = $1`, id).
			Scan(&s.available, &s.releaseDate, &s.releaseYear, &s.lyricsPresent); err != nil {
			t.Fatal(err)
		}
		return s
	}
	placeholder := song("placeholder")
	if placeholder.available == nil || *placeholder.available {
		t.Fatalf("NULL is_available became %v, want false", placeholder.available)
	}
	if placeholder.releaseDate != nil || placeholder.releaseYear != nil {
		t.Fatalf("1970-01-01 placeholder became date=%v year=%v, want NULL", placeholder.releaseDate, placeholder.releaseYear)
	}
	if placeholder.lyricsPresent == nil || !*placeholder.lyricsPresent {
		t.Fatalf("song with lyrics has is_lyrics_available=%v", placeholder.lyricsPresent)
	}
	dated := song("dated")
	if dated.releaseDate == nil || !dated.releaseDate.Equal(time.Date(2020, 3, 4, 0, 0, 0, 0, time.UTC)) || dated.releaseYear == nil || *dated.releaseYear != 2020 {
		t.Fatalf("dated song became date=%v year=%v", dated.releaseDate, dated.releaseYear)
	}
	if dated.lyricsPresent == nil || *dated.lyricsPresent {
		t.Fatalf("song without lyrics has is_lyrics_available=%v", dated.lyricsPresent)
	}
}
