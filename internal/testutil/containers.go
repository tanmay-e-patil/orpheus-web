//go:build integration

package testutil

import (
	"context"
	"fmt"
	"github.com/jackc/pgx/v5"
	"net/url"
	"os"
	"testing"
	"time"

	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/modules/rabbitmq"

	"orpheus-web/internal/store"
)

const PostgresImage = "postgres:17.6-alpine"
const RabbitMQImage = "rabbitmq:4.1.4-alpine"

func Postgres(t *testing.T, opts ...testcontainers.ContainerCustomizer) (*store.Store, string, *postgres.PostgresContainer) {
	t.Helper()
	if baseURL := os.Getenv("ORPHEUS_TEST_POSTGRES_URL"); baseURL != "" {
		databaseURL := isolatedDatabase(t, baseURL)
		db, err := store.Open(t.Context(), databaseURL)
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(db.Close)
		if err := db.MigrateUp(t.Context()); err != nil {
			t.Fatal(err)
		}
		return db, databaseURL, nil
	}
	ctx, cancel := context.WithTimeout(t.Context(), 90*time.Second)
	defer cancel()
	options := []testcontainers.ContainerCustomizer{postgres.WithDatabase("orpheus"), postgres.WithUsername("test"), postgres.WithPassword("test"), postgres.BasicWaitStrategies()}
	options = append(options, opts...)
	container, err := postgres.Run(ctx, PostgresImage, options...)
	if err != nil {
		t.Fatal(err)
	}
	testcontainers.CleanupContainer(t, container)
	url, err := container.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		t.Fatal(err)
	}
	db, err := store.Open(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(db.Close)
	if err := db.MigrateUp(ctx); err != nil {
		t.Fatal(err)
	}
	return db, url, container
}

func RabbitMQ(t *testing.T, opts ...testcontainers.ContainerCustomizer) (string, *rabbitmq.RabbitMQContainer) {
	t.Helper()
	ctx, cancel := context.WithTimeout(t.Context(), 90*time.Second)
	defer cancel()
	options := []testcontainers.ContainerCustomizer{rabbitmq.WithAdminUsername("test"), rabbitmq.WithAdminPassword("test")}
	options = append(options, opts...)
	container, err := rabbitmq.Run(ctx, RabbitMQImage, options...)
	if err != nil {
		t.Fatal(err)
	}
	testcontainers.CleanupContainer(t, container)
	url, err := container.AmqpURL(ctx)
	if err != nil {
		t.Fatal(err)
	}
	return url, container
}

func SeedSong(t *testing.T, db *store.Store, id string) {
	t.Helper()
	ctx := t.Context()
	if _, err := db.Pool.Exec(ctx, `INSERT INTO yt_music_videos (id,title,thumbnail,channel_title,published_at) VALUES ($1,'Video','','Channel','2024-01-01') ON CONFLICT DO NOTHING`, "video-"+id); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Pool.Exec(ctx, `INSERT INTO songs (id,name,artist_name,album_name,album_art,duration,yt_video_id,release_date,is_available,audio_file_path)
 VALUES ($1,$1,'Artist','Album','','PT1S',$2,'2024-01-01',true,'Artist/Album/' || $1 || '.m4a')`, id, "video-"+id); err != nil {
		t.Fatal(err)
	}
}

func Eventually(t *testing.T, timeout time.Duration, check func() bool) {
	t.Helper()
	deadline := time.NewTimer(timeout)
	defer deadline.Stop()
	ticker := time.NewTicker(10 * time.Millisecond)
	defer ticker.Stop()
	for {
		if check() {
			return
		}
		select {
		case <-t.Context().Done():
			t.Fatal(t.Context().Err())
		case <-deadline.C:
			t.Fatal("condition was not satisfied before deadline")
		case <-ticker.C:
		}
	}
}

// The optional native server must permit CREATE DATABASE. Each test gets an
// isolated database; this does not reset or migrate the supplied base database.
func isolatedDatabase(t *testing.T, baseURL string) string {
	t.Helper()
	parsed, err := url.Parse(baseURL)
	if err != nil {
		t.Fatal(err)
	}
	admin, err := pgx.Connect(t.Context(), baseURL)
	if err != nil {
		t.Fatal(err)
	}
	name := fmt.Sprintf("orpheus_test_%d", time.Now().UnixNano())
	if _, err := admin.Exec(t.Context(), "CREATE DATABASE "+pgx.Identifier{name}.Sanitize()); err != nil {
		admin.Close(context.Background())
		t.Fatal(err)
	}
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		defer admin.Close(ctx)
		if _, err := admin.Exec(ctx, "DROP DATABASE "+pgx.Identifier{name}.Sanitize()+" WITH (FORCE)"); err != nil {
			t.Error(err)
		}
	})
	parsed.Path = "/" + name
	return parsed.String()
}
