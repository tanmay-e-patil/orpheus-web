-- Reverse of 0001_songs_lyrics
ALTER TABLE "songs" DROP COLUMN IF EXISTS "release_year";
ALTER TABLE "songs" DROP COLUMN IF EXISTS "is_lyrics_available";
ALTER TABLE "songs" DROP COLUMN IF EXISTS "lyrics";
