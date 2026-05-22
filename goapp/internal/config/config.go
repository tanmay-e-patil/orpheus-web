package config

import (
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	DatabaseURL      string
	AuthUsername     string // deprecated: only used for legacy migration
	AuthPassword     string // deprecated: only used for legacy migration
	AuthPasswordHash string // deprecated: only used for legacy migration
	AuthCookieSecret string
	AuthRPOrigin     string
	YouTubeAPIKey    string
	RabbitMQURL      string
	MusicLibraryPath string
	Domain           string
	Port             string
	AppEnv           string
	CookieSecure     bool
	HTTPTimeout      time.Duration
}

func Load() (Config, error) {
	cfg := Config{
		DatabaseURL:      os.Getenv("DATABASE_URL"),
		AuthUsername:     os.Getenv("AUTH_USERNAME"),
		AuthPassword:     os.Getenv("AUTH_PASSWORD"),
		AuthPasswordHash: os.Getenv("AUTH_PASSWORD_HASH"),
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

func getenv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
