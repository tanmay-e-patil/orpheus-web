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

	httpClient := &http.Client{
		Timeout:   cfg.HTTPTimeout,
		Transport: otelhttp.NewTransport(http.DefaultTransport),
	}
	queue := services.NewQueuePublisher(cfg.RabbitMQURL)
	defer queue.Close()
	if queue.Enabled() {
		slog.Info("RabbitMQ publishing enabled", "queue", services.JobQueueName)
	} else {
		slog.Info("RabbitMQ publishing disabled", "reason", "RABBITMQ_URL is empty")
	}

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
	if err := shutdownTelemetry(shutdownCtx); err != nil {
		slog.Error("telemetry shutdown failed", "error", err)
	}
}
