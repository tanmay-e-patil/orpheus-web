import type { Song, Workflow, SongEdits, Video } from './types';
export function seconds(value?: string) {
  const m = String(value || '').match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  return m
    ? Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0)
    : 0;
}
export function clock(value: number) {
  const n = Math.max(0, Math.floor(value || 0));
  return n >= 3600
    ? `${Math.floor(n / 3600)}:${String(Math.floor((n % 3600) / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`
    : `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
}
export const duration = (value?: string) => clock(seconds(value));
export function searchSongs(songs: Song[], query: string) {
  const tokens = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return songs
    .map((song, index) => {
      const primary =
        `${song.name} ${song.artistName} ${song.albumName}`.toLowerCase();
      const all =
        `${primary} ${song.trackId} ${song.youtubeVideoId || ''} ${song.lyrics || ''} ${song.syncedLyrics || ''}`.toLowerCase();
      return {
        song,
        index,
        rank: tokens.every((t) => primary.includes(t))
          ? 0
          : tokens.every((t) => all.includes(t))
            ? 1
            : 2,
      };
    })
    .filter((row) => row.rank < 2)
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((row) => row.song);
}
export function makeEdits(state: Workflow): SongEdits[] {
  return state.trackMatches
    .filter((match) => match.selectedMatch)
    .map((match, index) => {
      const song = match.selectedMatch!;
      const lyrics = state.lyricsSearchResults.find(
        (result) => result.trackId === song.id,
      )?.selectedOption;
      return (
        state.editedTracks[index] || {
          trackName: song.name,
          artistName: song.artist,
          albumName: song.album,
          albumArt: song.albumImageUrl || '',
          releaseDate: song.releaseDate || '',
          trackDuration: match.youtubeVideo.duration || '',
          lyrics: lyrics?.plainLyrics || '',
          syncedLyrics: lyrics?.syncedLyrics || '',
        }
      );
    });
}
export function matchesSelection(state: Workflow) {
  const selected = state.selectedVideos
    .filter((video) => video.selected)
    .map((video) => video.id);
  return (
    state.trackMatchSearchQuery === state.searchQuery &&
    selected.length === state.trackMatches.length &&
    selected.every((id) =>
      state.trackMatches.some((match) => match.youtubeVideo.id === id),
    )
  );
}
export function sourceWarning(current?: string, candidate?: string) {
  const a = seconds(current),
    b = seconds(candidate),
    diff = Math.abs(a - b);
  return a && b && (diff > 30 || diff / a > 0.2)
    ? `Duration differs by ${diff} seconds.`
    : '';
}
export function adjustLrc(text: string, offset: number) {
  return text.replace(
    /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g,
    (_, mm, ss, frac = '0') => {
      const n = Math.max(
        0,
        Math.round(
          (Number(mm) * 60 + Number(ss)) * 100 +
            Number((frac + '00').slice(0, 2)) +
            offset * 100,
        ),
      );
      return `[${String(Math.floor(n / 6000)).padStart(2, '0')}:${String(Math.floor((n % 6000) / 100)).padStart(2, '0')}.${String(n % 100).padStart(2, '0')}]`;
    },
  );
}
export function syntheticVideo(song: Song): Video {
  return {
    id: song.youtubeVideoId || song.trackId,
    title: `${song.name} ${song.artistName}`,
    thumbnail: song.albumArt,
    duration: song.duration,
    channelTitle: song.artistName,
  };
}
