export type YouTubeVideo = {
  id: string;
  title: string;
  thumbnail: string;
  channelTitle: string;
  publishedAt: string;
  duration: string | null;
  viewCount: string | null;
};

export type MusicTrack = {
  id: string;
  name: string;
  artist: string;
  album: string;
  albumImageUrl: string;
  releaseDate: string;
  durationMs?: number;
};
