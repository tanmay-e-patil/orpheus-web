DO $$ BEGIN ALTER TABLE "songs" ADD COLUMN IF NOT EXISTS "lyrics" text DEFAULT '' NOT NULL; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "songs" ADD COLUMN IF NOT EXISTS "is_lyrics_available" boolean DEFAULT false; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "songs" ADD COLUMN IF NOT EXISTS "release_year" text DEFAULT 'Unknown'; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
