export type YouTubeVideo = {
  id: string;
  title: string;
  thumbnail: string;
  channelTitle: string;
  publishedAt: string;
  duration: string | null;
  viewCount: string | null;
};

export type SpotifyTrack = {
  id: string;
  name: string;
  artist: string;
  album: string;
  albumImageUrl: string;
  releaseDate: string;
  // Duration in milliseconds from Spotify API
  durationMs?: number;
};
