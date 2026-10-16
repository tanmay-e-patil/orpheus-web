export interface YouTubePlayer {
  destroy(): void;
  getCurrentTime(): number;
  getDuration(): number;
  getVolume(): number;
  setVolume(volume: number): void;
  isMuted(): boolean;
  mute(): void;
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
}
interface YouTubeAPI {
  Player: new (
    element: HTMLElement,
    options: Record<string, unknown>,
  ) => YouTubePlayer;
}
let loading: Promise<YouTubeAPI> | null = null;
export function loadYouTube(): Promise<YouTubeAPI> {
  const host = window as unknown as {
    YT?: YouTubeAPI;
    onYouTubeIframeAPIReady?: () => void;
  };
  if (host.YT?.Player) return Promise.resolve(host.YT);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      loading = null;
      reject(
        new Error(
          'YouTube could not load. Check your connection or content blocker.',
        ),
      );
    }, 15000);
    const previous = host.onYouTubeIframeAPIReady;
    host.onYouTubeIframeAPIReady = () => {
      previous?.();
      clearTimeout(timeout);
      resolve(host.YT!);
    };
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.onerror = () => {
      clearTimeout(timeout);
      loading = null;
      reject(new Error('YouTube could not load.'));
    };
    document.head.append(script);
  });
  return loading;
}
