export interface YouTubePlayer {
  destroy(): void;
  getCurrentTime(): number;
  getDuration(): number;
  getVolume(): number;
  setVolume(volume: number): void;
  isMuted(): boolean;
  mute(): void;
  unMute(): void;
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

export function youtubeErrorMessage(code: number): string {
  const reason = {
    2: 'The YouTube video link is invalid.',
    5: 'YouTube could not start video playback in this browser. Try playing the video again.',
    100: 'This YouTube video was removed or is private.',
    101: 'The owner of this video does not allow embedded playback.',
    150: 'The owner of this video does not allow embedded playback.',
    153: 'YouTube could not verify this website. Check browser privacy settings or open the video on YouTube.',
  }[code];
  return `${reason || 'YouTube could not play this video.'} (YouTube error ${code})`;
}
