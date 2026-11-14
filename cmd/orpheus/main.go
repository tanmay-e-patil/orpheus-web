package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	apphttp "orpheus-web/internal/http"

	"orpheus-web/internal/config"
	"orpheus-web/internal/services"
	"orpheus-web/internal/store"
	"orpheus-web/internal/telemetry"

	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	environment := os.Getenv("APP_ENV")
	if environment == "" {
		environment = "development"
	}
	shutdownTelemetry, err := telemetry.Setup(ctx, "orpheus-web", environment)
	if err != nil {
		slog.Error("telemetry setup failed", "error", err)
		os.Exit(1)
	}

	cfg, err := config.Load()
	if err != nil {
		slog.Error("config load failed", "error", err)
		os.Exit(1)
	}
	db, err := store.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		slog.Error("database connection failed", "error", err)
		os.Exit(1)
	}
	defer db.Close()

	if err := db.MigrateUp(ctx); err != nil {
		slog.Error("database migration failed", "error", err)
		os.Exit(1)
	}

	cacheCtx, stopCache := context.WithCancel(ctx)
	cacheDone := make(chan struct{})
	if cfg.LibraryCacheEnabled {
		library := store.NewLibraryCache(db)
		db.Library = library
		go func() { defer close(cacheDone); library.Run(cacheCtx) }()
		slog.Info("library cache enabled")
	} else {
		close(cacheDone)
	}
	defer func() { stopCache(); <-cacheDone }()

	httpClient := &http.Client{
		Timeout:   cfg.HTTPTimeout,
		Transport: otelhttp.NewTransport(http.DefaultTransport),
	}
	dispatcherCtx, stopDispatcher := context.WithCancel(ctx)
	dispatcherDone := make(chan struct{})
	if cfg.OutboxDispatchEnabled {
		dispatcher := &services.OutboxDispatcher{Store: db, Publisher: services.NewQueuePublisher(cfg.RabbitMQURL)}
		go func() { defer close(dispatcherDone); _ = dispatcher.Run(dispatcherCtx) }()
		slog.Info("outbox dispatch enabled", "queue", services.JobQueueName)
	} else {
		close(dispatcherDone)
		slog.Info("outbox dispatch paused; song jobs remain pending")
	}
	defer func() { stopDispatcher(); <-dispatcherDone }()

	webDir := filepath.Join("web")
	server := apphttp.NewServer(
		cfg,
		db,
		services.NewYouTubeClient(cfg.YouTubeAPIKey, httpClient),
		services.NewDeezerClient(httpClient),
		services.NewLRCLibClient(httpClient),
		webDir,
	)

	httpServer := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           server.Routes(),
		ReadHeaderTimeout: 5 * time.Second,
		IdleTimeout:       2 * time.Minute,
	}

	go func() {
		slog.Info("server listening", "port", cfg.Port)
		if err := httpServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			slog.Error("server failed", "error", err)
			stop()
		}
	}()

	<-ctx.Done()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := httpServer.Shutdown(shutdownCtx); err != nil {
		slog.Error("server shutdown failed", "error", err)
	}
	stopDispatcher()
	<-dispatcherDone
	if err := shutdownTelemetry(shutdownCtx); err != nil {
		slog.Error("telemetry shutdown failed", "error", err)
	}
}
