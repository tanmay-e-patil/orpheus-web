-- Statement-level change notifications for the in-process library cache.
-- pg_notify de-duplicates identical payloads per transaction, so bulk writes
-- produce one notification per channel per commit.
CREATE OR REPLACE FUNCTION notify_library_songs_changed() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify('library_songs_changed', '');
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION notify_library_plays_changed() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify('library_plays_changed', '');
  RETURN NULL;
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS library_songs_changed ON songs;
--> statement-breakpoint
CREATE TRIGGER library_songs_changed AFTER INSERT OR UPDATE OR DELETE ON songs
  FOR EACH STATEMENT EXECUTE FUNCTION notify_library_songs_changed();
--> statement-breakpoint
DROP TRIGGER IF EXISTS library_songs_truncated ON songs;
--> statement-breakpoint
CREATE TRIGGER library_songs_truncated AFTER TRUNCATE ON songs
  FOR EACH STATEMENT EXECUTE FUNCTION notify_library_songs_changed();
--> statement-breakpoint
DROP TRIGGER IF EXISTS library_plays_changed ON user_song_plays;
--> statement-breakpoint
CREATE TRIGGER library_plays_changed AFTER INSERT OR UPDATE OR DELETE ON user_song_plays
  FOR EACH STATEMENT EXECUTE FUNCTION notify_library_plays_changed();
--> statement-breakpoint
DROP TRIGGER IF EXISTS library_plays_truncated ON user_song_plays;
--> statement-breakpoint
CREATE TRIGGER library_plays_truncated AFTER TRUNCATE ON user_song_plays
  FOR EACH STATEMENT EXECUTE FUNCTION notify_library_plays_changed();
