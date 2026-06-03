CREATE TABLE IF NOT EXISTS user_song_plays (
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  track_id text NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  play_count integer NOT NULL DEFAULT 0,
  last_played_at timestamp NOT NULL DEFAULT now(),
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, track_id)
);

CREATE INDEX IF NOT EXISTS user_song_plays_user_sort_idx
  ON user_song_plays (user_id, play_count DESC, track_id);
