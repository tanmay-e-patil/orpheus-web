// Minimal YouTube IFrame API types used by this project
declare namespace YT {
  export enum PlayerState {
    UNSTARTED = -1,
    ENDED = 0,
    PLAYING = 1,
    PAUSED = 2,
    BUFFERING = 3,
    CUED = 5,
  }
  export interface PlayerEvent {
    data: PlayerState;
    target: Player;
  }
  export interface PlayerOptions {
    height?: string;
    width?: string;
    videoId?: string;
    playerVars?: Record<string, any>;
    events?: {
      onReady?: (e: PlayerEvent) => void;
      onStateChange?: (e: PlayerEvent) => void;
      onError?: (e: PlayerEvent) => void;
    };
  }
  export class Player {
    constructor(ele: Element | string, options?: PlayerOptions);
    loadVideoById(videoId: string): void;
    playVideo(): void;
    pauseVideo(): void;
    seekTo(seconds: number, allowSeekAhead: boolean): void;
    getDuration(): number;
    getCurrentTime(): number;
    // Volume controls
    setVolume(volume: number): void; // 0-100
    getVolume(): number;
    mute(): void;
    unMute(): void;
    isMuted(): boolean;
  }
}

interface Window {
  onYouTubeIframeAPIReady?: () => void;
}
