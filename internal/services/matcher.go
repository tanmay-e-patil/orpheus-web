package services

import (
	"math"
	"regexp"
	"strconv"
	"strings"
	"unicode"
)

var whitespace = regexp.MustCompile(`\s+`)

func CleanString(input string) string {
	var b strings.Builder
	for _, r := range strings.ToLower(input) {
		if unicode.IsLetter(r) || unicode.IsDigit(r) || unicode.IsSpace(r) || r == '_' {
			b.WriteRune(r)
		} else {
			b.WriteRune(' ')
		}
	}
	return strings.TrimSpace(whitespace.ReplaceAllString(b.String(), " "))
}

func StringSimilarity(a, b string) float64 {
	longer := a
	shorter := b
	if len([]rune(b)) > len([]rune(a)) {
		longer = b
		shorter = a
	}
	if len([]rune(longer)) == 0 {
		return 1
	}
	distance := LevenshteinDistance(longer, shorter)
	return float64(len([]rune(longer))-distance) / float64(len([]rune(longer)))
}

func LevenshteinDistance(a, b string) int {
	ar := []rune(a)
	br := []rune(b)
	matrix := make([][]int, len(br)+1)
	for i := range matrix {
		matrix[i] = make([]int, len(ar)+1)
		matrix[i][0] = i
	}
	for j := 0; j <= len(ar); j++ {
		matrix[0][j] = j
	}
	for i := 1; i <= len(br); i++ {
		for j := 1; j <= len(ar); j++ {
			if br[i-1] == ar[j-1] {
				matrix[i][j] = matrix[i-1][j-1]
				continue
			}
			matrix[i][j] = min(matrix[i-1][j-1]+1, min(matrix[i][j-1]+1, matrix[i-1][j]+1))
		}
	}
	return matrix[len(br)][len(ar)]
}

func ParseISODurationSeconds(duration string) int {
	match := regexp.MustCompile(`^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$`).FindStringSubmatch(duration)
	if match == nil {
		return 0
	}
	hours, _ := strconv.ParseFloat(defaultZero(match[1]), 64)
	minutes, _ := strconv.ParseFloat(defaultZero(match[2]), 64)
	seconds, _ := strconv.ParseFloat(defaultZero(match[3]), 64)
	return int(math.Round(hours*3600 + minutes*60 + seconds))
}

func ConfidenceFromScore(score int) string {
	switch {
	case score >= 70:
		return "high"
	case score >= 50:
		return "medium"
	case score > 0:
		return "low"
	default:
		return "none"
	}
}

func defaultZero(value string) string {
	if value == "" {
		return "0"
	}
	return value
}
