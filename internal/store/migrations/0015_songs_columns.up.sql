ALTER TABLE songs
  ALTER COLUMN artist_name DROP DEFAULT,
  ALTER COLUMN album_name DROP DEFAULT;
--> statement-breakpoint
UPDATE songs SET is_available = false WHERE is_available IS NULL;
--> statement-breakpoint
ALTER TABLE songs ALTER COLUMN is_available SET NOT NULL;
--> statement-breakpoint
ALTER TABLE songs ALTER COLUMN release_date DROP NOT NULL;
--> statement-breakpoint
-- 1970-01-01 was the import fallback for an unknown release date.
UPDATE songs SET release_date = NULL WHERE release_date = '1970-01-01';
--> statement-breakpoint
ALTER TABLE songs DROP COLUMN release_year;
--> statement-breakpoint
ALTER TABLE songs ADD COLUMN release_year integer GENERATED ALWAYS AS (extract(year from release_date)) STORED;
--> statement-breakpoint
ALTER TABLE songs DROP COLUMN is_lyrics_available;
--> statement-breakpoint
ALTER TABLE songs ADD COLUMN is_lyrics_available boolean GENERATED ALWAYS AS (lyrics <> '' OR synced_lyrics <> '') STORED;
--> statement-breakpoint
DROP INDEX IF EXISTS artist_name_idx;
