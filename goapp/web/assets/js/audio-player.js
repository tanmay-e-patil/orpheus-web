import { next, setController, setDuration, setPlaybackStatus, setTime, getPlayerState } from "./player-store.js";
import { toast } from "./store.js";
import { withViewTransition } from "./view-transitions.js";

let audio = null;
let raf = 0;

export function initAudioPlayer() {
  if (audio) return;
  audio = new Audio();
  audio.preload = "metadata";

  audio.addEventListener("loadstart", () => setPlaybackStatus("loading"));
  audio.addEventListener("loadedmetadata", () => syncDuration());
  audio.addEventListener("durationchange", () => syncDuration());
  audio.addEventListener("playing", () => {
    setPlaybackStatus("playing");
    startPolling();
  });
  audio.addEventListener("canplay", () => {
    if (!audio.paused) setPlaybackStatus("playing");
  });
  audio.addEventListener("pause", () => {
    stopPolling();
    setTime(audio.currentTime || 0);
    if (!audio.ended) setPlaybackStatus("paused");
  });
  audio.addEventListener("waiting", () => setPlaybackStatus("loading"));
  audio.addEventListener("stalled", () => setPlaybackStatus("loading"));
  audio.addEventListener("ended", () => {
    stopPolling();
    withViewTransition(() => next(), {
      scope: "song",
      songKind: "auto",
    });
  });
  audio.addEventListener("error", () => {
    stopPolling();
    console.warn("Audio playback error", { code: audio.error?.code, message: audio.error?.message });
    toast("Audio playback error. Skipping...", "error");
    withViewTransition(() => next(), {
      scope: "song",
      songKind: "auto",
    });
  });
  audio.addEventListener("timeupdate", () => setTime(audio.currentTime || 0));

  setController({
    load: (song) => {
      const audioUrl = song?.audioUrl || (song?.trackId ? `/api/songs/${encodeURIComponent(song.trackId)}/audio` : "");
      if (!audioUrl) {
        console.info("No audio URL available for song", { trackId: song?.trackId, isAvailable: song?.isAvailable });
        return;
      }
      stopPolling();
      console.info("Loading song audio", { trackId: song.trackId, audioUrl });
      if (audio.src !== new URL(audioUrl, window.location.href).href) {
        audio.src = audioUrl;
      }
      audio.load();
    },
    play: () => {
      const promise = audio.play();
      if (promise?.catch) {
        promise.catch((error) => {
          console.warn("Audio play failed", error);
          setPlaybackStatus("paused");
        });
      }
    },
    pause: () => audio.pause(),
    stop: () => {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      stopPolling();
    },
    seekTo: (seconds) => {
      audio.currentTime = Math.max(0, Number(seconds) || 0);
      setTime(audio.currentTime || 0);
    },
    getCurrentTime: () => audio.currentTime || 0,
    getDuration: () => Number.isFinite(audio.duration) ? audio.duration : 0,
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
  const duration = Number.isFinite(audio.duration) ? audio.duration : parseISODurationSeconds(getPlayerState().queue[getPlayerState().currentIndex]?.duration);
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
    }
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
}

function stopPolling() {
  if (!raf) return;
  cancelAnimationFrame(raf);
  raf = 0;
}

function parseISODurationSeconds(duration) {
  if (!duration) return 0;
  const match = String(duration).match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  return (Number(match[1] || 0) * 3600) + (Number(match[2] || 0) * 60) + Number(match[3] || 0);
}
