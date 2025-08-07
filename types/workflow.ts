import { SpotifyTrack, YouTubeVideo } from "./explorer";

export type WorkflowStage =
  | "search"
  | "youtube"
  | "spotify"
  | "lyrics"
  | "review"
  | "commit";

export type YouTubeDiscoveryResult = YouTubeVideo & {
  confidence: number;
  musicProbability: number; // AI-scored likelihood it's music content
  selected?: boolean;
};

export type SpotifyMatchResult = {
  youtubeVideo: YouTubeVideo;
  spotifyMatches: (SpotifyTrack & { matchScore: number })[];
  selectedMatch?: SpotifyTrack;
  confidence: "high" | "medium" | "low" | "none";
};

export type LyricsOption = {
  id: number;
  trackName: string;
  artistName: string;
  albumName?: string;
  duration?: number;
  plainLyrics?: string;
  syncedLyrics?: string; // LRC format
  source: "lrclib" | "manual";
  confidence: number; // 0-100 based on metadata match
  hasSync: boolean;
};

export type LyricsSearchResult = {
  trackId: string; // Spotify track ID for reference
  query: {
    track: string;
    artist: string;
    album?: string;
    duration?: number;
  };
  options: LyricsOption[];
  selectedOption?: LyricsOption;
  status: "found" | "partial" | "none";
};

export type EditableTrackData = {
  // YouTube metadata
  youtubeTitle: string;
  youtubeChannel: string;
  youtubeDuration: string;

  // Spotify metadata
  trackName: string;
  artistName: string;
  albumName: string;
  albumArt: string;
  releaseDate: string;
  spotifyDuration: string;

  // Lyrics data
  lyrics: string;
  syncedLyrics?: string;

  // User overrides
  customTags: string[];
  personalRating?: number;
};

export type ValidationResult = {
  isValid: boolean;
  warnings: string[];
  errors: string[];
};

export type ProcessedTrack = {
  youtube: YouTubeVideo;
  spotify?: SpotifyTrack;
  lyrics?: LyricsSearchResult;
  userEdits: Partial<EditableTrackData>;
  validationStatus: ValidationResult;
};

export type WorkflowState = {
  id: string; // Unique workflow session ID
  currentStage: WorkflowStage;
  searchQuery: string;
  selectedVideos: YouTubeDiscoveryResult[];
  spotifyMatches: SpotifyMatchResult[];
  lyricsSearchResults: LyricsSearchResult[]; // Multiple options per track
  editedTracks: EditableTrackData[];
  timestamp: string;
  expiresAt: string; // Auto-cleanup after 7 days
};

export type CommitResult = {
  trackId: string;
  success: boolean;
  error?: string;
};
