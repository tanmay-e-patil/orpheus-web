package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	apphttp "orpheus-goapp/internal/http"

	"orpheus-goapp/internal/config"
	"orpheus-goapp/internal/services"
	"orpheus-goapp/internal/store"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config: %v", err)
	}
	db, err := store.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("database: %v", err)
	}
	defer db.Close()

	httpClient := &http.Client{Timeout: cfg.HTTPTimeout}
	queue := services.NewQueuePublisher(cfg.RabbitMQURL)
	defer queue.Close()

	webDir := filepath.Join("web")
	server := apphttp.NewServer(
		cfg,
		db,
		services.NewYouTubeClient(cfg.YouTubeAPIKey, httpClient),
		services.NewDeezerClient(httpClient),
		services.NewLRCLibClient(httpClient),
		queue,
		webDir,
	)

	httpServer := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           server.Routes(),
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		log.Printf("Orpheus Go app listening on http://localhost:%s", cfg.Port)
		if err := httpServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("server: %v", err)
		}
	}()

	<-ctx.Done()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := httpServer.Shutdown(shutdownCtx); err != nil {
		log.Printf("shutdown: %v", err)
	}
}
