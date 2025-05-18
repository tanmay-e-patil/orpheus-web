CREATE TABLE "songs" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"artist_name" text DEFAULT 'Unknown' NOT NULL,
	"album_name" text DEFAULT 'Unknown' NOT NULL,
	"album_art" text NOT NULL,
	"duration" text NOT NULL,
	"yt_video_id" text NOT NULL,
	"is_available" boolean DEFAULT false,
	"release_date" date NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "yt_music_videos" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"thumbnail" text NOT NULL,
	"channel_title" text NOT NULL,
	"published_at" text NOT NULL,
	"duration" text,
	"view_count" text
);
--> statement-breakpoint
ALTER TABLE "songs" ADD CONSTRAINT "songs_yt_video_id_yt_music_videos_id_fk" FOREIGN KEY ("yt_video_id") REFERENCES "public"."yt_music_videos"("id") ON DELETE no action ON UPDATE no action;