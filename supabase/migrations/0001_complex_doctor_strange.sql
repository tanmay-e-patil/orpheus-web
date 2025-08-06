ALTER TABLE "songs" ADD COLUMN "lyrics" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "songs" ADD COLUMN "is_lyrics_available" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "songs" ADD COLUMN "release_year" text DEFAULT 'Unknown';