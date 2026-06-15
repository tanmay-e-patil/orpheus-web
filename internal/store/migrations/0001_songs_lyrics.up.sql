ALTER TABLE "songs" ADD COLUMN IF NOT EXISTS "lyrics" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "songs" ADD COLUMN IF NOT EXISTS "is_lyrics_available" boolean DEFAULT false;
--> statement-breakpoint
ALTER TABLE "songs" ADD COLUMN IF NOT EXISTS "release_year" text DEFAULT 'Unknown';
