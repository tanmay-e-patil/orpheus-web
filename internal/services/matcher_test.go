package services

import "testing"

func TestParseISODurationSeconds(t *testing.T) {
	tests := map[string]int{
		"PT3M45S":  225,
		"PT1H2M3S": 3723,
		"PT42S":    42,
		"bad":      0,
		"badPT3M":  0,
		"PT3Mbad":  0,
		"PT":       0,
	}
	for input, want := range tests {
		if got := ParseISODurationSeconds(input); got != want {
			t.Fatalf("ParseISODurationSeconds(%q) = %d, want %d", input, got, want)
		}
	}
}

func TestSanitizeDeezerDate(t *testing.T) {
	tests := map[string]string{
		"2024-05-02": "2024-05-02",
		"1999":       "1999-01-01",
		"0000-01-01": "",
		"nope":       "",
	}
	for input, want := range tests {
		if got := SanitizeDeezerDate(input); got != want {
			t.Fatalf("SanitizeDeezerDate(%q) = %q, want %q", input, got, want)
		}
	}
}

func TestConfidenceFromScore(t *testing.T) {
	tests := map[int]string{75: "high", 50: "medium", 31: "low", 0: "none"}
	for input, want := range tests {
		if got := ConfidenceFromScore(input); got != want {
			t.Fatalf("ConfidenceFromScore(%d) = %q, want %q", input, got, want)
		}
	}
}

func TestCleanStringAndSimilarity(t *testing.T) {
	if got := CleanString("Hello,  WORLD!!!"); got != "hello world" {
		t.Fatalf("CleanString got %q", got)
	}
	if got := StringSimilarity("abc", "abc"); got != 1 {
		t.Fatalf("StringSimilarity identical = %v, want 1", got)
	}
}
