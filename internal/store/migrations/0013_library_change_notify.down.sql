DROP TRIGGER IF EXISTS library_plays_truncated ON user_song_plays;
--> statement-breakpoint
DROP TRIGGER IF EXISTS library_plays_changed ON user_song_plays;
--> statement-breakpoint
DROP TRIGGER IF EXISTS library_songs_truncated ON songs;
--> statement-breakpoint
DROP TRIGGER IF EXISTS library_songs_changed ON songs;
--> statement-breakpoint
DROP FUNCTION IF EXISTS notify_library_plays_changed();
--> statement-breakpoint
DROP FUNCTION IF EXISTS notify_library_songs_changed();
