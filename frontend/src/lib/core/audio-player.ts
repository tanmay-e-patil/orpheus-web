import { api } from '../api';
import {
  next,
  setController,
  setDuration,
  setPlaybackStatus,
  setTime,
  getPlayerState,
  updateSongPlayCount,
} from './player-store.svelte';
import { notify } from '../notifications';
import { seconds as parseISODurationSeconds } from '../music';
import { library } from '../state.svelte';
import type { PlaybackController, Song } from '../types';
import {
  configureAudioSession,
  initMediaSession,
} from './media-session.svelte';

type PlayTracker = {
  trackId: string;
  listenedSeconds: number;
  recorded: boolean;
  lastTick: number;
};

// Assigned once by initAudioPlayer; the other functions run only after that.
let audio!: HTMLAudioElement;
let raf = 0;
let playTracker: PlayTracker | null = null;
const PLAY_COUNT_SECONDS = 10;

export function initAudioPlayer() {
  if (audio) return;
  audio = new Audio();
  audio.preload = 'metadata';
  configureAudioSession();
  initMediaSession();

  audio.addEventListener('loadstart', () => {
    if (isActive() && !audio.paused && !audio.ended)
      setPlaybackStatus('loading');
  });
  audio.addEventListener('loadedmetadata', () => {
    if (isActive()) syncDuration();
  });
  audio.addEventListener('durationchange', () => {
    if (isActive()) syncDuration();
  });
  audio.addEventListener('playing', () => {
    if (!isActive()) return;
    setPlaybackStatus('playing');
    startPolling(isActive);
  });
  audio.addEventListener('canplay', () => {
    if (!isActive()) return;
    if (!audio.paused) setPlaybackStatus('playing');
  });
  audio.addEventListener('pause', () => {
    if (!isActive()) return;
    stopPolling();
    setTime(audio.currentTime || 0);
    if (!audio.ended) setPlaybackStatus('paused');
  });
  audio.addEventListener('waiting', () => {
    if (isActive() && !audio.paused && !audio.ended)
      setPlaybackStatus('loading');
  });
  audio.addEventListener('stalled', () => {
    // A stalled download can still have enough buffered audio to keep playing.
    if (isActive() && !audio.paused && !audio.ended && audio.readyState < 3)
      setPlaybackStatus('loading');
  });
  audio.addEventListener('ended', () => {
    if (!isActive()) return;
    stopPolling();
    next();
  });
  audio.addEventListener('error', () => {
    if (!isActive()) return;
    stopPolling();
    console.warn('Audio playback error', {
      code: audio.error?.code,
      message: audio.error?.message,
    });
    notify('Audio playback error. Skipping...', 'error', {
      id: 'audio-playback-error',
    });
    next();
  });
  audio.addEventListener('timeupdate', () => {
    if (!isActive()) return;
    setTime(audio.currentTime || 0);
    // Recover from late loading events even if no new `playing` event arrives.
    if (
      !audio.paused &&
      !audio.ended &&
      !audio.seeking &&
      audio.readyState >= 3
    ) {
      setPlaybackStatus('playing');
      startPolling(isActive);
    }
  });

  const controller: PlaybackController = {
    load: (song: Song) => {
      const audioUrl =
        song?.audioUrl ||
        (song?.trackId
          ? `/api/songs/${encodeURIComponent(song.trackId)}/audio`
          : '');
      if (!audioUrl) {
        console.info('No audio URL available for song', {
          trackId: song?.trackId,
          isAvailable: song?.isAvailable,
        });
        return;
      }
      stopPolling();
      resetPlayTracker(song.trackId);
      console.info('Loading song audio', { trackId: song.trackId, audioUrl });
      if (audio.src !== new URL(audioUrl, window.location.href).href) {
        audio.src = audioUrl;
      }
      audio.load();
    },
    play: () => {
      configureAudioSession();
      const promise = audio.play();
      if (promise?.catch) {
        promise.catch((error: unknown) => {
          if (!isActive()) return;
          console.warn('Audio play failed', error);
          setPlaybackStatus('paused');
        });
      }
    },
    pause: () => {
      stopPolling();
      audio.pause();
    },
    stop: () => {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      stopPolling();
      playTracker = null;
    },
    seekTo: (seconds: number) => {
      audio.currentTime = Math.max(0, Number(seconds) || 0);
      setTime(audio.currentTime || 0);
    },
    getCurrentTime: () => audio.currentTime || 0,
    getDuration: () => (Number.isFinite(audio.duration) ? audio.duration : 0),
    setVolume: (volume: number) => {
      audio.volume = Math.max(0, Math.min(1, Number(volume) / 100));
    },
    getVolume: () => Math.round((audio.volume ?? 1) * 100),
    toggleMute: () => {
      audio.muted = !audio.muted;
    },
    isMuted: () => audio.muted,
  };
  const isActive = () => {
    const active = getPlayerState().controller;
    return active === controller || active?.usesAudio?.(controller);
  };
  setController(controller);
}

function syncDuration() {
  const duration = Number.isFinite(audio.duration)
    ? audio.duration
    : parseISODurationSeconds(
        getPlayerState().queue[getPlayerState().currentIndex]?.duration,
      );
  setDuration(duration || 0);
}

function startPolling(isActive: () => boolean | undefined) {
  if (raf) return;
  let last = 0;
  const step = () => {
    if (!isActive()) {
      stopPolling();
      return;
    }
    const now = performance.now();
    if (now - last > 250) {
      last = now;
      setTime(audio.currentTime || 0);
      syncDuration();
      trackListeningInterval();
    }
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
}

function stopPolling() {
  if (!raf) return;
  cancelAnimationFrame(raf);
  raf = 0;
  if (playTracker) playTracker.lastTick = 0;
}

function resetPlayTracker(trackId: string) {
  playTracker = { trackId, listenedSeconds: 0, recorded: false, lastTick: 0 };
}

function trackListeningInterval() {
  if (!playTracker || playTracker.recorded || audio.paused || audio.ended)
    return;
  const now = performance.now();
  if (playTracker.lastTick) {
    playTracker.listenedSeconds += Math.max(
      0,
      (now - playTracker.lastTick) / 1000,
    );
  }
  playTracker.lastTick = now;
  if (playTracker.listenedSeconds >= PLAY_COUNT_SECONDS) {
    recordCurrentPlay(playTracker.trackId);
  }
}

async function recordCurrentPlay(trackId: string) {
  if (!playTracker || playTracker.recorded || playTracker.trackId !== trackId)
    return;
  playTracker.recorded = true;
  try {
    const result = await api.recordSongPlay(trackId);
    updateSongPlayCount(result.trackId, result.playCount);
    library.playCounts.set(result.trackId, result.playCount);
  } catch (error) {
    const status = (error as { status?: number } | null)?.status;
    if (status !== 404 && status !== 409) {
      console.warn('song play tracking failed', error);
    }
  }
}
