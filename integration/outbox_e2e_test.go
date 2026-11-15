//go:build integration

package integration

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/testcontainers/testcontainers-go"
	tcexec "github.com/testcontainers/testcontainers-go/exec"
	"github.com/testcontainers/testcontainers-go/network"
	"github.com/testcontainers/testcontainers-go/wait"

	"orpheus-web/internal/http/handlers"
	"orpheus-web/internal/services"
	"orpheus-web/internal/store"
	"orpheus-web/internal/testutil"
)

func TestSongFileOutboxEndToEnd(t *testing.T) {
	ctx, cancel := context.WithTimeout(t.Context(), 5*time.Minute)
	defer cancel()
	netw, err := network.New(ctx)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = netw.Remove(context.Background()) })
	db, _, _ := testutil.Postgres(t, network.WithNetwork([]string{"postgres"}, netw))
	rabbitURL, broker := testutil.RabbitMQ(t, network.WithNetwork([]string{"rabbitmq"}, netw))
	source := os.Getenv("ORPHEUS_CONSUMER_DIR")
	if source == "" {
		source, err = filepath.Abs("../../orpheus-consumer")
		if err != nil {
			t.Fatal(err)
		}
	}
	if _, err := os.Stat(filepath.Join(source, "go.mod")); err != nil {
		t.Fatalf("set ORPHEUS_CONSUMER_DIR to the matching consumer checkout: %v", err)
	}
	buildContext := t.TempDir()
	build := exec.CommandContext(ctx, filepath.Join(runtime.GOROOT(), "bin", "go"), "build", "-o", filepath.Join(buildContext, "consumer"), ".")
	build.Dir = source
	build.Env = append(os.Environ(), "CGO_ENABLED=0", "GOOS=linux")
	if output, err := build.CombinedOutput(); err != nil {
		t.Fatalf("build consumer: %v\n%s", err, output)
	}
	dockerfile := "FROM alpine:3.22\nRUN apk add --no-cache ffmpeg\nCOPY consumer /consumer\nENTRYPOINT [\"/consumer\"]\n"
	if err := os.WriteFile(filepath.Join(buildContext, "Dockerfile"), []byte(dockerfile), 0644); err != nil {
		t.Fatal(err)
	}
	consumer, err := testcontainers.GenericContainer(ctx, testcontainers.GenericContainerRequest{ContainerRequest: testcontainers.ContainerRequest{
		FromDockerfile: testcontainers.FromDockerfile{Context: buildContext, Dockerfile: "Dockerfile"}, Networks: []string{netw.Name},
		Env:        map[string]string{"DATABASE_URL": "postgres://test:test@postgres:5432/orpheus?sslmode=disable", "RABBITMQ_URL": "amqp://test:test@rabbitmq:5672/", "MUSIC_LIBRARY_PATH": "/music", "JOB_TIMEOUT_SECONDS": "30"},
		WaitingFor: wait.ForLog("waiting for jobs").WithStartupTimeout(30 * time.Second),
	}, Started: true})
	if err != nil {
		t.Fatal(err)
	}
	testcontainers.CleanupContainer(t, consumer)
	t.Cleanup(func() {
		if t.Failed() {
			logs, err := consumer.Logs(context.Background())
			if err == nil {
				defer logs.Close()
				data, _ := io.ReadAll(logs)
				t.Logf("consumer logs:\n%s", data)
			}
		}
	})
	run := func(t *testing.T, args ...string) string {
		t.Helper()
		code, output, err := consumer.Exec(ctx, args, tcexec.Multiplexed())
		if err != nil {
			t.Fatal(err)
		}
		data, err := io.ReadAll(output)
		if err != nil {
			t.Fatal(err)
		}
		if code != 0 {
			t.Fatalf("command %v exited %d: %s", args, code, data)
		}
		return string(data)
	}
	read := func(t *testing.T, path string) string {
		t.Helper()
		stream, err := consumer.CopyFileFromContainer(ctx, path)
		if err != nil {
			t.Fatal(err)
		}
		defer stream.Close()
		data, err := io.ReadAll(stream)
		if err != nil {
			t.Fatal(err)
		}
		return string(data)
	}
	testutil.SeedSong(t, db, "Track")
	if _, err := db.Pool.Exec(ctx, `UPDATE songs SET synced_lyrics='[00:01]original' WHERE id='Track'`); err != nil {
		t.Fatal(err)
	}
	run(t, "mkdir", "-p", "/music/Artist/Album")
	run(t, "ffmpeg", "-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=0.1", "-c:a", "aac", "-y", "/music/Artist/Album/Track.m4a")
	dispatcherCtx, stopDispatcher := context.WithCancel(ctx)
	done := make(chan error, 1)
	go func() {
		done <- (&services.OutboxDispatcher{Store: db, Publisher: services.NewQueuePublisher(rabbitURL)}).Run(dispatcherCtx)
	}()
	t.Cleanup(func() {
		stopDispatcher()
		select {
		case <-done:
		case <-time.After(5 * time.Second):
			t.Error("dispatcher failed to shut down")
		}
	})
	waitCompleted := func(t *testing.T, n int) {
		t.Helper()
		testutil.Eventually(t, 15*time.Second, func() bool {
			var count int
			err := db.Pool.QueryRow(ctx, `SELECT count(*) FROM song_job_outbox WHERE completed_at IS NOT NULL`).Scan(&count)
			return err == nil && count == n
		})
	}
	saveLyrics := func(t *testing.T, plain, synced string) {
		t.Helper()
		body, _ := json.Marshal(map[string]string{"trackId": "Track", "plainLyrics": plain, "syncedLyrics": synced})
		response := httptest.NewRecorder()
		handlers.SaveLyrics(db).ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/lyrics/save", strings.NewReader(string(body))))
		if response.Code != http.StatusOK {
			t.Fatalf("lyrics save: %d %s", response.Code, response.Body.String())
		}
	}
	step := func(name string, fn func(t *testing.T)) {
		if !t.Run(name, fn) {
			t.FailNow()
		}
	}
	newAudio := "/music/New Artist/New Album/Renamed.m4a"
	newLyrics := "/music/New Artist/New Album/Renamed.lrc"
	stopTimeout := time.Second
	var originalHash string

	step("metadata edit moves and retags audio and sidecar", func(t *testing.T) {
		userID := func(context.Context) (string, bool) { return "user", true }
		request := httptest.NewRequest(http.MethodPatch, "/api/songs/Track/metadata", strings.NewReader(`{"name":"Renamed","artistName":"New Artist","albumName":"New Album","albumArt":"","releaseDate":"2025-02-03"}`))
		request.SetPathValue("trackId", "Track")
		response := httptest.NewRecorder()
		handlers.UpdateSongMetadata(db, userID).ServeHTTP(response, request)
		if response.Code != http.StatusOK {
			t.Fatalf("metadata save: %d %s", response.Code, response.Body.String())
		}
		waitCompleted(t, 1)
		run(t, "test", "-f", newAudio)
		testutil.Eventually(t, 5*time.Second, func() bool {
			var count int
			err := db.Pool.QueryRow(ctx, `SELECT count(*) FROM song_file_cleanup`).Scan(&count)
			return err == nil && count == 0
		})
		run(t, "test", "!", "-e", "/music/Artist/Album/Track.m4a")
		if got := read(t, newLyrics); got != "[00:01]original\n" {
			t.Fatalf("renamed sidecar=%q", got)
		}
		tags := run(t, "ffprobe", "-v", "error", "-show_entries", "format_tags=title,artist,album,date", "-of", "json", newAudio)
		for _, want := range []string{"Renamed", "New Artist", "New Album", "2025-02-03"} {
			if !strings.Contains(tags, want) {
				t.Fatalf("missing tag %q: %s", want, tags)
			}
		}
		originalHash = strings.Fields(run(t, "sha256sum", newAudio))[0]
	})

	step("published lyrics job waits for a stopped consumer to restart", func(t *testing.T) {
		if err := consumer.Stop(ctx, &stopTimeout); err != nil {
			t.Fatal(err)
		}
		saveLyrics(t, "plain", "[00:02]updated")
		testutil.Eventually(t, 5*time.Second, func() bool {
			var n int
			err := db.Pool.QueryRow(ctx, `SELECT count(*) FROM song_job_outbox WHERE published_at IS NOT NULL`).Scan(&n)
			return err == nil && n == 2
		})
		if err := consumer.Start(ctx); err != nil {
			t.Fatal(err)
		}
		waitCompleted(t, 2)
		if got := read(t, newLyrics); got != "[00:02]updated\n" {
			t.Fatalf("updated sidecar=%q", got)
		}
		if got := strings.Fields(run(t, "sha256sum", newAudio))[0]; got != originalHash {
			t.Fatal("lyrics edit modified audio")
		}
	})

	step("clearing lyrics removes the sidecar and keeps audio", func(t *testing.T) {
		saveLyrics(t, "", "")
		waitCompleted(t, 3)
		run(t, "test", "!", "-e", newLyrics)
		if got := strings.Fields(run(t, "sha256sum", newAudio))[0]; got != originalHash {
			t.Fatal("lyrics removal modified audio")
		}
	})

	step("deletion committed during a broker outage is delivered by retry", func(t *testing.T) {
		saveLyrics(t, "plain", "[00:03]delete me")
		waitCompleted(t, 4)
		if err := broker.Stop(ctx, &stopTimeout); err != nil {
			t.Fatal(err)
		}
		deletionRequest := httptest.NewRequest(http.MethodDelete, "/api/songs/Track", nil)
		deletionRequest.SetPathValue("trackId", "Track")
		deletionResponse := httptest.NewRecorder()
		handlers.DeleteSong(db).ServeHTTP(deletionResponse, deletionRequest)
		if deletionResponse.Code != http.StatusAccepted {
			t.Fatalf("delete: %d %s", deletionResponse.Code, deletionResponse.Body.String())
		}
		if _, err := db.SongForAudio(ctx, "Track"); err == nil {
			t.Fatal("deleted song is still readable")
		}
		run(t, "test", "-f", newAudio)
		run(t, "test", "-f", newLyrics)
		if err := broker.Start(ctx); err != nil {
			t.Fatal(err)
		}
		waitCompleted(t, 5)
		run(t, "test", "!", "-e", newAudio)
		run(t, "test", "!", "-e", newLyrics)
	})

	step("delayed process job for a deleted song completes without recreating files", func(t *testing.T) {
		if _, err := db.Pool.Exec(ctx, `INSERT INTO song_job_outbox(song_id,action) VALUES('Track',$1)`, store.ProcessSongAction); err != nil {
			t.Fatal(err)
		}
		waitCompleted(t, 6)
		run(t, "test", "!", "-e", newAudio)
		run(t, "test", "!", "-e", newLyrics)
	})
}
