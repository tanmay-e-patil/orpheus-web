-- Library pagination indexes matching FetchSongsPage's ORDER BY and keyset
-- predicates for live (non-deleted) songs, so pages are index range scans
-- instead of full-table scans plus sorts.
CREATE INDEX IF NOT EXISTS songs_live_artist_id_idx ON songs (artist_name, id) WHERE deleted_at IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS songs_live_created_id_idx ON songs (created_at DESC, id) WHERE deleted_at IS NULL;
