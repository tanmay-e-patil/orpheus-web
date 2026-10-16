import { API } from './api.js';
import {
  next,
  setController,
  setDuration,
  setPlaybackStatus,
  setTime,
  getPlayerState,
  updateSongPlayCount,
} from './player-store.js';
import { toast } from './store.js';
const withViewTransition = (update) => update();

let audio = null;
let raf = 0;
let playTracker = null;
const PLAY_COUNT_SECONDS = 10;

export function initAudioPlayer() {
  if (audio) return;
  audio = new Audio();
  audio.preload = 'metadata';

  audio.addEventListener('loadstart', () => setPlaybackStatus('loading'));
  audio.addEventListener('loadedmetadata', () => syncDuration());
  audio.addEventListener('durationchange', () => syncDuration());
  audio.addEventListener('playing', () => {
    setPlaybackStatus('playing');
    startPolling();
  });
  audio.addEventListener('canplay', () => {
    if (!audio.paused) setPlaybackStatus('playing');
  });
  audio.addEventListener('pause', () => {
    stopPolling();
    setTime(audio.currentTime || 0);
    if (!audio.ended) setPlaybackStatus('paused');
  });
  audio.addEventListener('waiting', () => setPlaybackStatus('loading'));
  audio.addEventListener('stalled', () => setPlaybackStatus('loading'));
  audio.addEventListener('ended', () => {
    stopPolling();
    withViewTransition(() => next(), {
      scope: 'song',
      songKind: 'auto',
    });
  });
  audio.addEventListener('error', () => {
    stopPolling();
    console.warn('Audio playback error', {
      code: audio.error?.code,
      message: audio.error?.message,
    });
    toast('Audio playback error. Skipping...', 'error');
    withViewTransition(() => next(), {
      scope: 'song',
      songKind: 'auto',
    });
  });
  audio.addEventListener('timeupdate', () => setTime(audio.currentTime || 0));

  setController({
    load: (song) => {
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
      const promise = audio.play();
      if (promise?.catch) {
        promise.catch((error) => {
          console.warn('Audio play failed', error);
          setPlaybackStatus('paused');
        });
      }
    },
    pause: () => audio.pause(),
    stop: () => {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      stopPolling();
      playTracker = null;
    },
    seekTo: (seconds) => {
      audio.currentTime = Math.max(0, Number(seconds) || 0);
      setTime(audio.currentTime || 0);
    },
    getCurrentTime: () => audio.currentTime || 0,
    getDuration: () => (Number.isFinite(audio.duration) ? audio.duration : 0),
    setVolume: (volume) => {
      audio.volume = Math.max(0, Math.min(1, Number(volume) / 100));
    },
    getVolume: () => Math.round((audio.volume ?? 1) * 100),
    toggleMute: () => {
      audio.muted = !audio.muted;
    },
    isMuted: () => audio.muted,
  });
}

function syncDuration() {
  const duration = Number.isFinite(audio.duration)
    ? audio.duration
    : parseISODurationSeconds(
        getPlayerState().queue[getPlayerState().currentIndex]?.duration,
      );
  setDuration(duration || 0);
}

function startPolling() {
  if (raf) return;
  let last = 0;
  const step = () => {
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

function resetPlayTracker(trackId) {
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

async function recordCurrentPlay(trackId) {
  if (!playTracker || playTracker.recorded || playTracker.trackId !== trackId)
    return;
  playTracker.recorded = true;
  try {
    const result = await API.recordSongPlay(trackId);
    updateSongPlayCount(result.trackId, result.playCount);
    window.dispatchEvent(
      new CustomEvent('orpheus:song-play-recorded', { detail: result }),
    );
  } catch (error) {
    if (error?.status !== 404 && error?.status !== 409) {
      console.warn('song play tracking failed', error);
    }
  }
}

function parseISODurationSeconds(duration) {
  if (!duration) return 0;
  const match = String(duration).match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  return (
    Number(match[1] || 0) * 3600 +
    Number(match[2] || 0) * 60 +
    Number(match[3] || 0)
  );
}
