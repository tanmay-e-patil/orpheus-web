package store

import (
	"context"
	"io/fs"
)

func Migrate(ctx context.Context, s *Store, fsys fs.FS) error {
	return s.migrate(ctx, fsys)
}
