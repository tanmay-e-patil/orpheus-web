package config

import (
	"os"
	"testing"
)

func TestOutboxDispatchConfiguration(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://localhost/orpheus")
	t.Setenv("AUTH_COOKIE_SECRET", "test-secret")
	t.Setenv("DOMAIN", "localhost")
	t.Setenv("AUTH_RP_ORIGIN", "http://localhost:8080")
	t.Setenv("APP_ENV", "development")
	t.Setenv("HTTP_TIMEOUT_SECONDS", "15")
	for _, tc := range []struct {
		name, url, setting               string
		explicit, wantEnabled, wantError bool
	}{
		{name: "no broker pauses dispatch"},
		{name: "configured broker enables dispatch", url: "amqp://localhost", wantEnabled: true},
		{name: "explicit pause", url: "amqp://localhost", setting: "false", explicit: true},
		{name: "explicit enable", url: "amqp://localhost", setting: "true", explicit: true, wantEnabled: true},
		{name: "enable requires broker", setting: "true", explicit: true, wantError: true},
		{name: "invalid flag is rejected", setting: "sometimes", explicit: true, wantError: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Setenv("RABBITMQ_URL", tc.url)
			// Register cleanup of any inherited setting before testing its absence.
			t.Setenv("OUTBOX_DISPATCH_ENABLED", tc.setting)
			if !tc.explicit {
				if err := os.Unsetenv("OUTBOX_DISPATCH_ENABLED"); err != nil {
					t.Fatal(err)
				}
			}
			cfg, err := Load()
			if (err != nil) != tc.wantError {
				t.Fatalf("Load error=%v, wantError=%t", err, tc.wantError)
			}
			if err == nil && cfg.OutboxDispatchEnabled != tc.wantEnabled {
				t.Fatalf("enabled=%t, want=%t", cfg.OutboxDispatchEnabled, tc.wantEnabled)
			}
		})
	}
}
