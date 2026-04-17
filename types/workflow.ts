import { MusicTrack, YouTubeVideo } from "./explorer";

export type WorkflowStage =
  | "search"
  | "youtube"
  | "spotify"
  | "lyrics"
  | "review"
  | "commit";

export type YouTubeDiscoveryResult = YouTubeVideo & {
  confidence: number;
  musicProbability: number;
  selected?: boolean;
};

export type TrackMatchResult = {
  youtubeVideo: YouTubeVideo;
  trackMatches: (MusicTrack & { matchScore: number })[];
  selectedMatch?: MusicTrack;
  confidence: "high" | "medium" | "low" | "none";
};

export type LyricsOption = {
  id: number;
  trackName: string;
  artistName: string;
  albumName?: string;
  duration?: number;
  plainLyrics?: string;
  syncedLyrics?: string;
  source: "lrclib" | "manual";
  confidence: number;
  hasSync: boolean;
};

export type LyricsSearchResult = {
  trackId: string;
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
  youtubeTitle: string;
  youtubeChannel: string;
  youtubeDuration: string;

  trackName: string;
  artistName: string;
  albumName: string;
  albumArt: string;
  releaseDate: string;
  trackDuration: string;

  lyrics: string;
  syncedLyrics?: string;

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
  track?: MusicTrack;
  lyrics?: LyricsSearchResult;
  userEdits: Partial<EditableTrackData>;
  validationStatus: ValidationResult;
};

export type WorkflowState = {
  id: string;
  currentStage: WorkflowStage;
  searchQuery: string;
  selectedVideos: YouTubeDiscoveryResult[];
  trackMatches: TrackMatchResult[];
  lyricsSearchResults: LyricsSearchResult[];
  editedTracks: EditableTrackData[];
  timestamp: string;
  expiresAt: string;
};

export type CommitResult = {
  trackId: string;
  success: boolean;
  error?: string;
};
