DO $$ BEGIN ALTER TABLE "songs" ADD COLUMN IF NOT EXISTS "synced_lyrics" text DEFAULT '' NOT NULL; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
