package store

import (
	"context"
	"io/fs"
)

func Migrate(ctx context.Context, s *Store, fsys fs.FS) error {
	return s.migrate(ctx, fsys)
}

func EmbeddedMigrations() fs.FS {
	sub, err := fs.Sub(migrationsFS, "migrations")
	if err != nil {
		panic(err)
	}
	return sub
}
