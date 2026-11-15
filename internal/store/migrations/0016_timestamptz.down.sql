ALTER TABLE user_song_plays
  ALTER COLUMN last_played_at TYPE timestamp USING last_played_at AT TIME ZONE 'UTC',
  ALTER COLUMN created_at TYPE timestamp USING created_at AT TIME ZONE 'UTC',
  ALTER COLUMN updated_at TYPE timestamp USING updated_at AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE songs
  ALTER COLUMN created_at TYPE timestamp USING created_at AT TIME ZONE 'UTC',
  ALTER COLUMN updated_at TYPE timestamp USING updated_at AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE account
  ALTER COLUMN created_at TYPE timestamp USING created_at AT TIME ZONE 'UTC',
  ALTER COLUMN updated_at TYPE timestamp USING updated_at AT TIME ZONE 'UTC';
--> statement-breakpoint
ALTER TABLE "user"
  ALTER COLUMN created_at TYPE timestamp USING created_at AT TIME ZONE 'UTC',
  ALTER COLUMN updated_at TYPE timestamp USING updated_at AT TIME ZONE 'UTC';
