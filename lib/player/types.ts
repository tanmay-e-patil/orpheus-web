export type Song = {
  spotifyId: string;
  name: string;
  artistName: string;
  albumName: string;
  albumArt: string;
  lyrics: string;
  syncedLyrics: string;
  isLyricsAvailable: boolean | null;
  duration: string; // ISO-8601 duration string
  youtubeVideoId: string;
};

export type PlayerStatus =
  | "idle"
  | "loading"
  | "playing"
  | "paused"
  | "ended"
  | "error";

export type PlayerController = {
  load: (videoId: string) => void;
  play: () => void;
  pause: () => void;
  seekTo: (seconds: number) => void;
  getCurrentTime?: () => number;
  getDuration?: () => number;
  // Optional volume controls
  setVolume?: (volume: number) => void; // 0-100
  getVolume?: () => number;
  toggleMute?: () => void;
  isMuted?: () => boolean;
};
