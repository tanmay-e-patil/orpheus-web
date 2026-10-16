-- Keep serving the existing file while metadata changes are processed.
ALTER TABLE songs ADD COLUMN IF NOT EXISTS audio_file_path text;
UPDATE songs
SET audio_file_path = artist_name || '/' || album_name || '/' || name || '.m4a'
WHERE audio_file_path IS NULL;

-- Retain cleanup work across a crash after the new path has been committed.
CREATE TABLE IF NOT EXISTS song_file_cleanup (
  song_id text NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  relative_path text NOT NULL,
  PRIMARY KEY (song_id, relative_path)
);

CREATE INDEX IF NOT EXISTS songs_audio_file_path_idx ON songs (audio_file_path);
