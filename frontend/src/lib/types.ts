export interface Song {
  trackId: string;
  name: string;
  artistName: string;
  albumName: string;
  albumArt?: string;
  duration?: string;
  releaseDate?: string;
  audioUrl?: string;
  youtubeVideoId?: string;
  isAvailable: boolean;
  lyrics?: string;
  syncedLyrics?: string;
  playCount?: number;
}
export interface Video {
  id: string;
  title: string;
  thumbnail?: string;
  channelTitle?: string;
  duration?: string;
  viewCount?: string | number;
  publishedAt?: string;
  confidence?: number;
  selected?: boolean;
}
export interface Track {
  id: string;
  name: string;
  artist: string;
  album: string;
  albumImageUrl?: string;
  releaseDate?: string;
  durationMs?: number;
  matchScore?: number;
  popularity?: number;
  matchEvidence?: {
    titleScore: number;
    titleExact: boolean;
    titleConflict: boolean;
    artistConflict: boolean;
    artistScore: number;
    durationScore?: number;
    versionConflict: boolean;
    durationConflict: boolean;
    reasons: string[];
  };
}
export interface Match {
  youtubeVideo: Video;
  trackMatches: Track[];
  selectedMatch?: Track;
  confidence?: string;
  autoAccept?: boolean;
  reasons?: string[];
}
export interface LyricsOption {
  id: string | number;
  trackName: string;
  artistName: string;
  albumName?: string;
  duration?: number;
  hasSync?: boolean;
  plainLyrics?: string;
  syncedLyrics?: string;
  confidence?: number;
}
export interface LyricsResult {
  trackId: string;
  options: LyricsOption[];
  selectedOption?: LyricsOption;
  query?: { track: string; artist: string; album?: string };
  status?: string;
  autoAccept?: boolean;
}
export interface SongEdits {
  trackName: string;
  artistName: string;
  albumName: string;
  albumArt: string;
  releaseDate: string;
  trackDuration: string;
  lyrics: string;
  syncedLyrics: string;
}
export interface SaveResult {
  trackId: string;
  success: boolean;
  error?: string;
}
export interface Workflow {
  id: string;
  searchQuery: string;
  currentStage: string;
  timestamp: string;
  expiresAt: string;
  selectedVideos: Video[];
  trackMatches: Match[];
  trackMatchSearchQuery?: string;
  lyricsSearchResults: LyricsResult[];
  editedTracks: SongEdits[];
  saveResults?: SaveResult[];
  automaticMatching?: boolean;
  reviewFirst?: boolean;
  reviewPrepared?: boolean;
  lyricsManuallyEdited?: boolean;
  reviewNotices?: { audio?: string; metadata?: string; lyrics?: string };
}
export interface Session {
  authenticated: boolean;
  user?: { id: string; email?: string; username?: string };
}
export interface SongDetail {
  song: Song;
  audioSource: Video | null;
  fileUpdateQueued?: boolean;
}
