CREATE INDEX IF NOT EXISTS artist_name_idx ON songs USING btree (artist_name);
--> statement-breakpoint
ALTER TABLE songs DROP COLUMN is_lyrics_available;
--> statement-breakpoint
ALTER TABLE songs ADD COLUMN is_lyrics_available boolean DEFAULT false;
--> statement-breakpoint
UPDATE songs SET is_lyrics_available = (lyrics <> '' OR synced_lyrics <> '');
--> statement-breakpoint
ALTER TABLE songs DROP COLUMN release_year;
--> statement-breakpoint
ALTER TABLE songs ADD COLUMN release_year text DEFAULT 'Unknown';
--> statement-breakpoint
UPDATE songs SET release_date = '1970-01-01' WHERE release_date IS NULL;
--> statement-breakpoint
UPDATE songs SET release_year = extract(year from release_date)::text;
--> statement-breakpoint
ALTER TABLE songs ALTER COLUMN release_date SET NOT NULL;
--> statement-breakpoint
ALTER TABLE songs ALTER COLUMN is_available DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE songs
  ALTER COLUMN artist_name SET DEFAULT 'Unknown',
  ALTER COLUMN album_name SET DEFAULT 'Unknown';
