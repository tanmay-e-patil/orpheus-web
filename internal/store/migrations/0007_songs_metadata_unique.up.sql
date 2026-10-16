ALTER TABLE songs
  ADD CONSTRAINT songs_artist_album_name_unique
  UNIQUE (artist_name, album_name, name);
