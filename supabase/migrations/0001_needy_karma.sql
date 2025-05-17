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