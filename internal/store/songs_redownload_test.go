package store

import (
	"reflect"
	"strings"
	"testing"
	"time"
)

func TestBuildRedownloadSongIDsQueryDefaultsToUnavailableOnly(t *testing.T) {
	query, args := buildRedownloadSongsQuery(RedownloadSongsFilter{})

	if !strings.HasPrefix(query, "select id, name, artist_name from songs") {
		t.Fatalf("query should select dry-run display fields: %s", query)
	}
	if !strings.Contains(query, "is_available = false") {
		t.Fatalf("query missing unavailable predicate: %s", query)
	}
	if !strings.Contains(query, "order by updated_at asc, id asc") {
		t.Fatalf("query missing deterministic ordering: %s", query)
	}
	if len(args) != 0 {
		t.Fatalf("expected no args, got %v", args)
	}
}

func TestBuildRedownloadSongIDsQueryAllSkipsUnavailablePredicate(t *testing.T) {
	query, args := buildRedownloadSongsQuery(RedownloadSongsFilter{IncludeAvailable: true})

	if strings.Contains(query, "is_available") {
		t.Fatalf("query should not filter availability when IncludeAvailable is true: %s", query)
	}
	if len(args) != 0 {
		t.Fatalf("expected no args, got %v", args)
	}
}

func TestBuildRedownloadSongIDsQueryCombinesTimestampFiltersWithAnd(t *testing.T) {
	after := time.Date(2026, 5, 1, 0, 0, 0, 0, time.UTC)
	before := time.Date(2026, 5, 8, 0, 0, 0, 0, time.UTC)

	query, args := buildRedownloadSongsQuery(RedownloadSongsFilter{
		UpdatedAfter:  &after,
		UpdatedBefore: &before,
	})

	wantFragments := []string{
		"is_available = false",
		" and updated_at >= $1",
		" and updated_at <= $2",
	}
	for _, fragment := range wantFragments {
		if !strings.Contains(query, fragment) {
			t.Fatalf("query missing %q: %s", fragment, query)
		}
	}
	if !reflect.DeepEqual(args, []any{after, before}) {
		t.Fatalf("unexpected args: %#v", args)
	}
}

func TestBuildRedownloadSongIDsQueryAddsPositiveLimit(t *testing.T) {
	after := time.Date(2026, 5, 1, 0, 0, 0, 0, time.UTC)
	query, args := buildRedownloadSongsQuery(RedownloadSongsFilter{
		IncludeAvailable: true,
		UpdatedAfter:     &after,
		Limit:            20,
	})

	if !strings.HasSuffix(query, "limit $2") {
		t.Fatalf("query missing limit placeholder after timestamp arg: %s", query)
	}
	if !reflect.DeepEqual(args, []any{after, 20}) {
		t.Fatalf("unexpected args: %#v", args)
	}
}

func TestBuildRedownloadSongIDsQueryIgnoresNonPositiveLimit(t *testing.T) {
	query, args := buildRedownloadSongsQuery(RedownloadSongsFilter{Limit: -1})

	if strings.Contains(query, " limit ") {
		t.Fatalf("query should not include non-positive limit: %s", query)
	}
	if len(args) != 0 {
		t.Fatalf("expected no args, got %v", args)
	}
}

func TestBuildRedownloadSongsQueryAvailableOnly(t *testing.T) {
	query, _ := buildRedownloadSongsQuery(RedownloadSongsFilter{AvailableOnly: true, IncludeAvailable: true})
	if !strings.Contains(query, "is_available = true") {
		t.Fatalf("query missing available predicate: %s", query)
	}
	if strings.Contains(query, "is_available = false") {
		t.Fatalf("query should not select unavailable songs: %s", query)
	}
}
