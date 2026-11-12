package store

import (
	"context"
	"embed"
	"fmt"
	"io/fs"
	"log/slog"
	"sort"
	"strings"
	"time"

	"github.com/exaring/otelpgx"
	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed migrations/*.up.sql
var migrationsFS embed.FS

type Store struct {
	Pool *pgxpool.Pool
}

func Open(ctx context.Context, databaseURL string) (*Store, error) {
	cfg, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, err
	}
	cfg.ConnConfig.Tracer = otelpgx.NewTracer(otelpgx.WithDisableSQLStatementInAttributes())
	applyPoolLatencyDefaults(cfg, databaseURL)
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, err
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, err
	}
	return &Store{Pool: pool}, nil
}

// applyPoolLatencyDefaults keeps warm connections so requests never pay for a
// TCP/TLS/auth handshake, and spreads lifetime recycling so connections do not
// all reconnect at once. Explicit pool_* settings in the URL take precedence.
func applyPoolLatencyDefaults(cfg *pgxpool.Config, databaseURL string) {
	if !strings.Contains(databaseURL, "pool_min_conns") && cfg.MinConns < 4 {
		cfg.MinConns = min(4, cfg.MaxConns)
	}
	if !strings.Contains(databaseURL, "pool_max_conn_lifetime_jitter") && cfg.MaxConnLifetimeJitter == 0 {
		cfg.MaxConnLifetimeJitter = cfg.MaxConnLifetime / 4
	}
	if !strings.Contains(databaseURL, "pool_health_check_period") {
		cfg.HealthCheckPeriod = 15 * time.Second
	}
}

func (s *Store) Close() {
	if s != nil && s.Pool != nil {
		s.Pool.Close()
	}
}

// MigrateUp runs all pending up-migrations in order.
// It uses a schema_migrations table to track which ones have run.
func (s *Store) MigrateUp(ctx context.Context) error {
	// Create tracking table if it doesn't exist
	_, err := s.Pool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version TEXT PRIMARY KEY,
			run_at  TIMESTAMPTZ NOT NULL DEFAULT now()
		)
	`)
	if err != nil {
		return fmt.Errorf("create schema_migrations: %w", err)
	}

	// Get already-applied versions
	applied := make(map[string]bool)
	rows, err := s.Pool.Query(ctx, `SELECT version FROM schema_migrations`)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var v string
		if err := rows.Scan(&v); err != nil {
			return err
		}
		applied[v] = true
	}
	if err := rows.Err(); err != nil {
		return err
	}

	// Read and sort migration files
	entries, err := fs.Glob(migrationsFS, "migrations/*.up.sql")
	if err != nil {
		return err
	}
	sort.Strings(entries)

	for _, entry := range entries {
		// Extract version from filename: "migrations/0004_passkeys.up.sql" → "0004_passkeys"
		base := strings.TrimSuffix(entry, ".up.sql")
		version := strings.TrimPrefix(base, "migrations/")

		if applied[version] {
			continue
		}

		sql, err := migrationsFS.ReadFile(entry)
		if err != nil {
			return fmt.Errorf("read migration %s: %w", entry, err)
		}

		slog.InfoContext(ctx, "running database migration", "component", "database", "version", version)

		// Run each statement separately (pgx doesn't support multi-statement in Exec)
		statements := splitStatements(string(sql))
		for _, stmt := range statements {
			stmt = strings.TrimSpace(stmt)
			if stmt == "" {
				continue
			}
			if _, err := s.Pool.Exec(ctx, stmt); err != nil {
				return fmt.Errorf("migration %s failed: %w", version, err)
			}
		}

		// Record as applied
		_, err = s.Pool.Exec(ctx, `INSERT INTO schema_migrations (version) VALUES ($1)`, version)
		if err != nil {
			return fmt.Errorf("record migration %s: %w", version, err)
		}

		slog.InfoContext(ctx, "database migration complete", "component", "database", "version", version)
	}

	return nil
}

// splitStatements splits SQL on the --> statement-breakpoint marker
// that Drizzle/Neon migrations use, or on semicolons otherwise.
func splitStatements(sql string) []string {
	if strings.Contains(sql, "--> statement-breakpoint") {
		parts := strings.Split(sql, "--> statement-breakpoint")
		return parts
	}

	// Split on semicolons, but skip ones inside strings
	var statements []string
	var current strings.Builder
	inString := false
	stringChar := byte(0)

	for i := 0; i < len(sql); i++ {
		ch := sql[i]
		if inString {
			current.WriteByte(ch)
			if ch == stringChar && (i == 0 || sql[i-1] != '\\') {
				inString = false
			}
			continue
		}
		if ch == '\'' {
			inString = true
			stringChar = ch
			current.WriteByte(ch)
			continue
		}
		if ch == '-' && i+1 < len(sql) && sql[i+1] == '-' {
			// Skip line comment
			end := strings.IndexByte(sql[i:], '\n')
			if end == -1 {
				break
			}
			i += end
			continue
		}
		if ch == ';' {
			stmt := strings.TrimSpace(current.String())
			if stmt != "" {
				statements = append(statements, stmt)
			}
			current.Reset()
			continue
		}
		current.WriteByte(ch)
	}

	stmt := strings.TrimSpace(current.String())
	if stmt != "" {
		statements = append(statements, stmt)
	}

	return statements
}
