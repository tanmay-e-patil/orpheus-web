package store

import (
	"context"

	"orpheus-web/internal/types"
)

func (s *Store) UpsertSongAndVideo(ctx context.Context, song types.SongUpsert, video types.YouTubeVideo) error {
	defer s.songsChanged()
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var duration, viewCount any
	if video.Duration != nil {
		duration = *video.Duration
	}
	if video.ViewCount != nil {
		viewCount = *video.ViewCount
	}

	_, err = tx.Exec(ctx, `
		insert into yt_music_videos (id, title, thumbnail, channel_title, published_at, duration, view_count)
		values ($1, $2, $3, $4, $5, $6, $7)
		on conflict (id) do update set
		  title = excluded.title,
		  thumbnail = excluded.thumbnail,
		  channel_title = excluded.channel_title,
		  published_at = excluded.published_at,
		  duration = excluded.duration,
		  view_count = excluded.view_count
	`, video.ID, video.Title, video.Thumbnail, video.ChannelTitle, video.PublishedAt, duration, viewCount)
	if err != nil {
		return err
	}

	tag, err := tx.Exec(ctx, `
		insert into songs (
		  id, name, artist_name, album_name, album_art, lyrics, synced_lyrics,
		  is_lyrics_available, duration, yt_video_id, is_available, release_date,
		  release_year, created_at, updated_at
		)
		values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::date, $13, now(), now())
		on conflict (id) do update set
		  name = excluded.name,
		  artist_name = excluded.artist_name,
		  album_name = excluded.album_name,
		  album_art = excluded.album_art,
		  lyrics = excluded.lyrics,
		  synced_lyrics = excluded.synced_lyrics,
		  is_lyrics_available = excluded.is_lyrics_available,
		  duration = excluded.duration,
		  yt_video_id = excluded.yt_video_id,
		  is_available = excluded.is_available,
		  release_date = excluded.release_date,
		  release_year = excluded.release_year,
		  updated_at = now()
		where songs.deleted_at IS NULL
	`, song.TrackID, song.Name, song.ArtistName, song.AlbumName, song.AlbumArt, song.Lyrics, song.SyncedLyrics, song.IsLyricsAvailable, song.Duration, song.YoutubeVideoID, song.IsAvailable, song.ReleaseDate, song.ReleaseYear)
	if err != nil {
		return err
	}

	if tag.RowsAffected() == 0 {
		return ErrSongDeleted
	}

	if _, err := enqueueSongJob(ctx, tx, song.TrackID, ProcessSongAction); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
