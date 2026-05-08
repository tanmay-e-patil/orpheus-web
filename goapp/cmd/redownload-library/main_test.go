package main

import (
	"testing"
	"time"
)

func TestParseOptionalTimestampAcceptsRFC3339(t *testing.T) {
	got, err := parseOptionalTimestamp("updated-after", "2026-05-08T00:00:00Z")
	if err != nil {
		t.Fatalf("parseOptionalTimestamp returned error: %v", err)
	}

	want := time.Date(2026, 5, 8, 0, 0, 0, 0, time.UTC)
	if got == nil || !got.Equal(want) {
		t.Fatalf("got %v, want %v", got, want)
	}
}

func TestParseOptionalTimestampRejectsAmbiguousDate(t *testing.T) {
	if _, err := parseOptionalTimestamp("updated-after", "2026-05-08"); err == nil {
		t.Fatal("expected invalid timestamp error")
	}
}

func TestFormatOptionalTimestamp(t *testing.T) {
	if got := formatOptionalTimestamp(nil); got != "none" {
		t.Fatalf("got %q, want none", got)
	}

	value := time.Date(2026, 5, 7, 19, 0, 0, 0, time.FixedZone("CDT", -5*60*60))
	if got := formatOptionalTimestamp(&value); got != "2026-05-08T00:00:00Z" {
		t.Fatalf("got %q, want UTC RFC3339", got)
	}
}
