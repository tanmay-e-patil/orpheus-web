export const SONGS_PAGE_SIZE = 50;

export type SongCursor = {
  artistName: string;
  trackId: string;
};

export type LibrarySong = {
  trackId: string;
  name: string;
  artistName: string;
  albumName: string;
  albumArt: string;
  duration: string;
  youtubeVideoId: string;
  lyrics?: string;
  syncedLyrics?: string;
  isLyricsAvailable?: boolean | null;
};

export type SongsPageResponse = {
  songs: LibrarySong[];
  nextCursor: SongCursor | null;
  hasMore: boolean;
  pageRevision: string;
};
