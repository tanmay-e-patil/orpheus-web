//go:build integration

package store_test

import (
	"context"
	"fmt"
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
