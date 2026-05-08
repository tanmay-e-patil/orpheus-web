package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"strings"
	"time"

	"orpheus-goapp/internal/services"
	"orpheus-goapp/internal/store"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintf(os.Stderr, "redownload-library: %v\n", err)
		os.Exit(1)
	}
}

func run() error {
	var (
		includeAvailable = flag.Bool("all", false, "queue every song instead of only unavailable songs")
		updatedAfterRaw  = flag.String("updated-after", "", "only queue songs updated at or after this RFC3339 timestamp")
		updatedBeforeRaw = flag.String("updated-before", "", "only queue songs updated at or before this RFC3339 timestamp")
		dryRun           = flag.Bool("dry-run", false, "print matching track IDs without publishing RabbitMQ jobs")
		limit            = flag.Int("limit", 0, "maximum songs to queue; 0 means no limit")
	)
	flag.Parse()
	if *limit < 0 {
		return fmt.Errorf("limit must be greater than or equal to 0")
	}

	updatedAfter, err := parseOptionalTimestamp("updated-after", *updatedAfterRaw)
	if err != nil {
		return err
	}
	updatedBefore, err := parseOptionalTimestamp("updated-before", *updatedBeforeRaw)
	if err != nil {
		return err
	}
	if updatedAfter != nil && updatedBefore != nil && updatedAfter.After(*updatedBefore) {
		return fmt.Errorf("updated-after must be before or equal to updated-before")
	}

	databaseURL := strings.TrimSpace(os.Getenv("DATABASE_URL"))
	if databaseURL == "" {
		return fmt.Errorf("DATABASE_URL is required")
	}
	rabbitMQURL := strings.TrimSpace(os.Getenv("RABBITMQ_URL"))
	if rabbitMQURL == "" && !*dryRun {
		return fmt.Errorf("RABBITMQ_URL is required unless --dry-run is set")
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()

	db, err := store.Open(ctx, databaseURL)
	if err != nil {
		return fmt.Errorf("open database: %w", err)
	}
	defer db.Close()

	filter := store.RedownloadSongsFilter{
		IncludeAvailable: *includeAvailable,
		UpdatedAfter:     updatedAfter,
		UpdatedBefore:    updatedBefore,
		Limit:            *limit,
	}
	trackIDs, err := db.RedownloadSongIDs(ctx, filter)
	if err != nil {
		return fmt.Errorf("fetch songs to redownload: %w", err)
	}

	fmt.Printf("Matched %d songs for redownload\n", len(trackIDs))
	fmt.Printf("Filters: unavailable_only=%t updated_after=%s updated_before=%s limit=%d\n",
		!*includeAvailable,
		formatOptionalTimestamp(updatedAfter),
		formatOptionalTimestamp(updatedBefore),
		*limit,
	)

	if *dryRun {
		for _, trackID := range trackIDs {
			fmt.Println(trackID)
		}
		return nil
	}

	queue := services.NewQueuePublisher(rabbitMQURL)
	defer queue.Close()

	for i, trackID := range trackIDs {
		if err := queue.PublishProcessSong(ctx, trackID); err != nil {
			return fmt.Errorf("publish job for %s: %w", trackID, err)
		}
		if (i+1)%25 == 0 {
			fmt.Printf("Published %d/%d jobs\n", i+1, len(trackIDs))
		}
	}
	fmt.Printf("Published %d jobs\n", len(trackIDs))
	return nil
}

func parseOptionalTimestamp(name, value string) (*time.Time, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil, nil
	}
	parsed, err := time.Parse(time.RFC3339, value)
	if err != nil {
		return nil, fmt.Errorf("invalid %s: use RFC3339 like 2026-05-08T00:00:00Z", name)
	}
	return &parsed, nil
}

func formatOptionalTimestamp(value *time.Time) string {
	if value == nil {
		return "none"
	}
	return value.UTC().Format(time.RFC3339)
}
