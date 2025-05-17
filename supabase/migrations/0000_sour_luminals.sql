CREATE TABLE "songs" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"artist_name" text DEFAULT 'Unknown' NOT NULL,
	"album_name" text DEFAULT 'Unknown' NOT NULL,
	"duration" text NOT NULL,
	"yt_video_id" text NOT NULL,
	"is_available" boolean DEFAULT false,
	"release_date" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
