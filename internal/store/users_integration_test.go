//go:build integration

package store_test

import (
	"fmt"
	"slices"
	"sync"
	"testing"

	"orpheus-web/internal/testutil"
)

func TestSetPasswordForUserConcurrently(t *testing.T) {
	db, _, _ := testutil.Postgres(t)
	ctx := t.Context()
	user, err := db.CreateUser(ctx, "user", "owner", "owner@example.com", "owner")
	if err != nil {
		t.Fatal(err)
	}
	const writers = 8
	hashes := make([]string, writers)
	errs := make([]error, writers)
	start := make(chan struct{})
	var wg sync.WaitGroup
	for i := range writers {
		hashes[i] = fmt.Sprintf("hash-%d", i)
		wg.Go(func() {
			<-start
			errs[i] = db.SetPasswordForUser(ctx, user.ID, hashes[i])
		})
	}
	close(start)
	wg.Wait()
	for i, err := range errs {
		if err != nil {
			t.Errorf("writer %d: %v", i, err)
		}
	}
	var rows int
	if err := db.Pool.QueryRow(ctx, `SELECT count(*) FROM account WHERE user_id = $1 AND provider_id = 'credential'`, user.ID).Scan(&rows); err != nil {
		t.Fatal(err)
	}
	if rows != 1 {
		t.Fatalf("credential rows = %d, want 1", rows)
	}
	got, err := db.GetPasswordForUser(ctx, user.ID)
	if err != nil || !slices.Contains(hashes, got) {
		t.Fatalf("password = %q, err = %v", got, err)
	}

	if err := db.SetPasswordForUser(ctx, user.ID, "replacement"); err != nil {
		t.Fatal(err)
	}
	if got, err := db.GetPasswordForUser(ctx, user.ID); err != nil || got != "replacement" {
		t.Fatalf("password after replace = %q, err = %v", got, err)
	}
}

func TestUserEmailIsCaseInsensitive(t *testing.T) {
	db, _, _ := testutil.Postgres(t)
	ctx := t.Context()
	created, err := db.CreateUser(ctx, "user", "owner", "Owner@Example.com", "owner")
	if err != nil {
		t.Fatal(err)
	}
	found, err := db.GetUserByEmail(ctx, "owner@EXAMPLE.com")
	if err != nil || found.ID != created.ID {
		t.Fatalf("case-variant lookup = %+v, err = %v", found, err)
	}
	if _, err := db.CreateUser(ctx, "other", "other", "OWNER@example.com", "other"); err == nil {
		t.Fatal("created a second user whose email differs only in case")
	}
}
