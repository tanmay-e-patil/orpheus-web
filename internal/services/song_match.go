package services

import (
	"html"
	"math"
	"regexp"
	"sort"
	"strings"

	"orpheus-web/internal/types"
)

var presentationWords = regexp.MustCompile(`\b(song with lyrics|with lyrics|official|music video|video|audio|lyrical|lyrics|hd|hq|4k|1080p|visualizer)\b`)
var titleSeparators = regexp.MustCompile(`\s+[-–—]\s+|[|:]`)
var versionWords = []string{"live", "remix", "acoustic", "cover", "instrumental", "karaoke", "sped up", "slowed", "radio edit", "extended", "remaster"}

func identityText(s string) string {
	return strings.TrimSpace(whitespace.ReplaceAllString(presentationWords.ReplaceAllString(CleanString(html.UnescapeString(s)), " "), " "))
}

// Whole tokens avoid treating names such as "Air" and "Chair" as the same artist.
func containsIdentity(text, name string) bool {
	return name != "" && strings.Contains(" "+text+" ", " "+name+" ")
}

func tokenSimilarity(a, b string) float64 {
	a, b = CleanString(a), CleanString(b)
	if a == "" || b == "" {
		return 0
	}
	at, bt := strings.Fields(a), strings.Fields(b)
	sort.Strings(at)
	sort.Strings(bt)
	return math.Max(StringSimilarity(a, b), StringSimilarity(strings.Join(at, " "), strings.Join(bt, " ")))
}

func versionConflict(a, b string) bool {
	a, b = CleanString(a), CleanString(b)
	for _, version := range versionWords {
		if containsIdentity(a, version) != containsIdentity(b, version) {
			return true
		}
	}
	return false
}

func durationEvidence(a, b float64) (float64, bool) {
	diff := math.Abs(a - b)
	return math.Max(0, 1-diff/math.Max(30, b*0.15)), diff > math.Max(10, b*0.05)
}

// Infer an explicit identity only when one side of a two-part title corroborates
// the candidate. Multi-part film credits and arbitrary channel names are not artist evidence.
func explicitIdentity(video types.YouTubeVideo, title, artist string) (string, string) {
	parts := []string{}
	for _, part := range titleSeparators.Split(html.UnescapeString(video.Title), -1) {
		if cleaned := identityText(part); cleaned != "" {
			parts = append(parts, cleaned)
		}
	}
	if len(parts) == 2 {
		switch {
		case parts[0] == artist:
			return parts[1], parts[0]
		case parts[1] == artist:
			return parts[0], parts[1]
		case tokenSimilarity(recordingTitle(parts[1]), recordingTitle(title)) >= .85:
			return parts[1], parts[0]
		case tokenSimilarity(recordingTitle(parts[0]), recordingTitle(title)) >= .85:
			return parts[0], parts[1]
		}
	}
	return "", ""
}

func recordingTitle(title string) string {
	title = " " + identityText(title) + " "
	for _, version := range versionWords {
		title = strings.ReplaceAll(title, " "+version+" ", " ")
	}
	return strings.TrimSpace(whitespace.ReplaceAllString(title, " "))
}

func scoreTrackMatch(video types.YouTubeVideo, track deezerTrack) (int, *types.MatchEvidence) {
	title, artist := identityText(track.Title), identityText(track.Artist.Name)
	source := identityText(video.Title)
	// Remove a known artist before comparing titles; inspect raw segments before cleaning separators.
	stripArtist := func(text string) string {
		if artist != "" && !(text == title && containsIdentity(identityText(video.ChannelTitle), artist)) {
			return strings.TrimSpace(strings.Replace(" "+text+" ", " "+artist+" ", " ", 1))
		}
		return text
	}
	withoutArtist := stripArtist(source)
	titleExact := title != "" && withoutArtist == title
	titleScore := tokenSimilarity(withoutArtist, title)
	if containsIdentity(withoutArtist, title) {
		titleScore = 1
	}
	for _, segment := range titleSeparators.Split(html.UnescapeString(video.Title), -1) {
		part := stripArtist(identityText(segment))
		titleScore = math.Max(titleScore, tokenSimilarity(part, title))
		if title != "" && part == title {
			titleExact = true
		}
	}
	artistScore := 0.0
	if containsIdentity(source, artist) || containsIdentity(identityText(video.ChannelTitle), artist) {
		artistScore = 1
	}
	sourceTitle, sourceArtist := explicitIdentity(video, title, artist)
	titleConflict := sourceTitle != "" && title != "" && tokenSimilarity(recordingTitle(sourceTitle), recordingTitle(title)) < .85
	// Containment can help retrieve a candidate, but a longer explicitly identified
	// title ("Hello Goodbye" versus "Hello") is a different song.
	if sourceTitle != "" && recordingTitle(sourceTitle) != recordingTitle(title) &&
		(containsIdentity(recordingTitle(sourceTitle), recordingTitle(title)) || containsIdentity(recordingTitle(title), recordingTitle(sourceTitle))) {
		titleConflict = true
	}
	artistConflict := artistScore == 0 && artist != "" && sourceArtist != "" && tokenSimilarity(sourceArtist, artist) < .9
	e := &types.MatchEvidence{TitleScore: int(math.Round(titleScore * 100)), TitleExact: titleExact, ArtistScore: int(artistScore * 100), TitleConflict: titleConflict, ArtistConflict: artistConflict, Reasons: []string{}}
	if titleConflict {
		e.Reasons = append(e.Reasons, "Different song title")
	} else if titleExact {
		e.Reasons = append(e.Reasons, "Song title matches")
	} else {
		e.Reasons = append(e.Reasons, "Song title needs confirmation")
	}
	if artistConflict {
		e.Reasons = append(e.Reasons, "Different artist")
	} else if artistScore == 1 {
		e.Reasons = append(e.Reasons, "Artist matches the title or channel")
	} else {
		e.Reasons = append(e.Reasons, "Artist unverified")
	}
	score := titleScore*50 + artistScore*30
	if video.Duration != nil && track.Duration > 0 {
		seconds := ParseISODurationSeconds(*video.Duration)
		if seconds > 0 {
			d, conflict := durationEvidence(float64(seconds), float64(track.Duration))
			points := int(math.Round(d * 100))
			e.DurationScore, e.DurationConflict = &points, conflict
			score += 20 * d
			if conflict {
				score -= 20
				e.Reasons = append(e.Reasons, "Audio duration differs")
			} else {
				e.Reasons = append(e.Reasons, "Audio duration matches")
			}
		}
	}
	if e.DurationScore == nil {
		e.Reasons = append(e.Reasons, "Duration unavailable")
	}
	e.VersionConflict = versionConflict(video.Title, track.Title)
	if e.VersionConflict {
		score -= 40
		e.Reasons = append(e.Reasons, "Recording versions differ")
	}
	if titleConflict || artistConflict {
		return 0, e
	}
	return int(math.Round(math.Max(0, score))), e
}

// Album/single duplicates do not count as competing recordings. Be conservative when duration is absent.
func sameRecording(a, b types.MusicTrack) bool {
	return CleanString(a.Name) == CleanString(b.Name) && CleanString(a.Artist) == CleanString(b.Artist) &&
		a.DurationMs != nil && b.DurationMs != nil && math.Abs(float64(*a.DurationMs-*b.DurationMs)) <= 3000
}

func trackDecision(matches []types.MusicTrack) (bool, []string) {
	if len(matches) == 0 {
		return false, []string{"No song information found"}
	}
	top := matches[0]
	e := top.MatchEvidence
	reasons := []string{}
	if e == nil {
		return false, []string{"Match evidence unavailable"}
	}
	reasons = append(reasons, e.Reasons...)
	strong := top.MatchScore >= 90 && e.TitleScore >= 95 && e.TitleExact && e.ArtistScore >= 95 && e.DurationScore != nil && !e.DurationConflict && !e.VersionConflict && !e.TitleConflict && !e.ArtistConflict
	for _, other := range matches[1:] {
		if !sameRecording(top, other) && top.MatchScore-other.MatchScore < 8 {
			reasons = append(reasons, "Another recording has a similar score")
			return false, reasons
		}
	}
	return strong, reasons
}

func trackSearchQueries(video types.YouTubeVideo, query string) []string {
	queries := []string{}
	seen := map[string]bool{}
	add := func(s string) {
		s = strings.TrimSpace(s)
		key := CleanString(html.UnescapeString(s))
		if key != "" && !seen[key] {
			seen[key] = true
			queries = append(queries, s)
		}
	}
	add(query)
	add(identityText(video.Title))
	for _, part := range titleSeparators.Split(html.UnescapeString(video.Title), -1) {
		add(identityText(part))
	}
	if len(queries) > 4 {
		queries = queries[:4]
	}
	return queries
}
