package config

import (
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

type LegacyAuthConfig struct {
	Email        string
	Password     string
	PasswordHash string
}

type Config struct {
	DatabaseURL             string
	LegacyAuth              LegacyAuthConfig
	AuthCookieSecret        string
	AuthRPOrigin            string
	AuthRegistrationEnabled bool
	YouTubeAPIKey           string
	RabbitMQURL             string
	OutboxDispatchEnabled   bool
	LibraryCacheEnabled     bool
	MusicLibraryPath        string
	Domain                  string
	Port                    string
	AppEnv                  string
	CookieSecure            bool
	HTTPTimeout             time.Duration
}

func Load() (Config, error) {
	cfg := Config{
		DatabaseURL: os.Getenv("DATABASE_URL"),
		LegacyAuth: LegacyAuthConfig{
			Email:        envOr([]string{"AUTH_EMAIL", "AUTH_USERNAME"}),
			Password:     os.Getenv("AUTH_PASSWORD"),
			PasswordHash: os.Getenv("AUTH_PASSWORD_HASH"),
		},
		AuthCookieSecret: os.Getenv("AUTH_COOKIE_SECRET"),
		AuthRPOrigin:     os.Getenv("AUTH_RP_ORIGIN"),
		YouTubeAPIKey:    os.Getenv("YOUTUBE_API_KEY"),
		RabbitMQURL:      os.Getenv("RABBITMQ_URL"),
		MusicLibraryPath: getenv("MUSIC_LIBRARY_PATH", "/music"),
		Domain:           os.Getenv("DOMAIN"),
		Port:             getenv("PORT", "8080"),
		AppEnv:           getenv("APP_ENV", "development"),
		HTTPTimeout:      15 * time.Second,
	}
	cfg.OutboxDispatchEnabled = cfg.RabbitMQURL != ""
	if raw, exists := os.LookupEnv("OUTBOX_DISPATCH_ENABLED"); exists {
		enabled, err := strconv.ParseBool(raw)
		if err != nil {
			return Config{}, fmt.Errorf("invalid OUTBOX_DISPATCH_ENABLED: %w", err)
		}
		if enabled && cfg.RabbitMQURL == "" {
			return Config{}, errors.New("RABBITMQ_URL is required when outbox dispatch is enabled")
		}
		cfg.OutboxDispatchEnabled = enabled
	}
	if raw, exists := os.LookupEnv("AUTH_REGISTRATION_ENABLED"); exists {
		enabled, err := strconv.ParseBool(raw)
		if err != nil {
			return Config{}, fmt.Errorf("invalid AUTH_REGISTRATION_ENABLED: %w", err)
		}
		cfg.AuthRegistrationEnabled = enabled
	}
	cfg.LibraryCacheEnabled = true
	if raw, exists := os.LookupEnv("LIBRARY_CACHE_ENABLED"); exists {
		enabled, err := strconv.ParseBool(raw)
		if err != nil {
			return Config{}, fmt.Errorf("invalid LIBRARY_CACHE_ENABLED: %w", err)
		}
		cfg.LibraryCacheEnabled = enabled
	}
	cfg.CookieSecure = cfg.AppEnv == "production"

	if raw := os.Getenv("HTTP_TIMEOUT_SECONDS"); raw != "" {
		seconds, err := strconv.Atoi(raw)
		if err != nil || seconds <= 0 {
			return Config{}, fmt.Errorf("invalid HTTP_TIMEOUT_SECONDS: %q", raw)
		}
		cfg.HTTPTimeout = time.Duration(seconds) * time.Second
	}

	var missing []string
	for name, value := range map[string]string{
		"DATABASE_URL":       cfg.DatabaseURL,
		"AUTH_COOKIE_SECRET": cfg.AuthCookieSecret,
	} {
		if strings.TrimSpace(value) == "" {
			missing = append(missing, name)
		}
	}
	if strings.TrimSpace(cfg.Domain) == "" {
		missing = append(missing, "DOMAIN")
	}
	if strings.TrimSpace(cfg.AuthRPOrigin) == "" {
		missing = append(missing, "AUTH_RP_ORIGIN")
	}
	if cfg.AppEnv == "production" && strings.TrimSpace(cfg.RabbitMQURL) == "" {
		missing = append(missing, "RABBITMQ_URL")
	}
	if len(missing) > 0 {
		return Config{}, errors.New("missing required config: " + strings.Join(missing, ", "))
	}
	return cfg, nil
}

func envOr(keys []string) string {
	for _, k := range keys {
		if v := os.Getenv(k); v != "" {
			return v
		}
	}
	return ""
}

func getenv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
