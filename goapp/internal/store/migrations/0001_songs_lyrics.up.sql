DO $$ BEGIN
  ALTER TABLE "songs" ADD COLUMN IF NOT EXISTS "lyrics" text DEFAULT '' NOT NULL;
  ALTER TABLE "songs" ADD COLUMN IF NOT EXISTS "is_lyrics_available" boolean DEFAULT false;
  ALTER TABLE "songs" ADD COLUMN IF NOT EXISTS "release_year" text DEFAULT 'Unknown';
END $$;
