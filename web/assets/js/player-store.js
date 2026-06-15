export const playerStore = new EventTarget();

const state = {
  queue: [],
  currentIndex: 0,
  status: "idle",
  currentTime: 0,
  duration: 0,
  controller: null,
};

export function getPlayerState() {
  return state;
}

function emit() {
  playerStore.dispatchEvent(new CustomEvent("change", { detail: state }));
}

export function setController(controller) {
  state.controller = controller;
  emit();
}

export function clearPlayer() {
  state.controller?.stop?.();
  state.queue = [];
  state.currentIndex = 0;
  state.status = "idle";
  state.currentTime = 0;
  state.duration = 0;
  emit();
}

export function setQueue(queue, currentIndex) {
  state.queue = queue;
  state.currentIndex = currentIndex;
  state.currentTime = 0;
  loadCurrentSong({ autoplay: true });
  emit();
}

export function updateSongAlbumArt(trackId, albumArt) {
  state.queue = state.queue.map((song) => song.trackId === trackId ? { ...song, albumArt } : song);
  emit();
}

export function updateSongPlayCount(trackId, playCount) {
  state.queue = state.queue.map((song) => song.trackId === trackId ? { ...song, playCount } : song);
  emit();
}

export function updateSongLyrics(trackId, plainLyrics, syncedLyrics) {
  state.queue = state.queue.map((song) => song.trackId === trackId ? {
    ...song,
    lyrics: plainLyrics,
    syncedLyrics,
    isLyricsAvailable: true,
  } : song);
  emit();
}

export function play() {
  if (!playableSong(currentSong())) {
    state.status = "unavailable";
    emit();
    return;
  }
  state.controller?.play();
  state.status = "playing";
  emit();
}

export function pause() {
  state.controller?.pause();
  state.status = "paused";
  emit();
}

export function setPlaybackStatus(status) {
  if (state.status === status) return;
  state.status = status;
  emit();
}

export function next() {
  const nextIndex = state.currentIndex + 1;
  if (nextIndex >= state.queue.length) {
    state.status = "ended";
    emit();
    return;
  }
  state.currentIndex = nextIndex;
  state.currentTime = 0;
  loadCurrentSong({ autoplay: true });
  emit();
}

export function prev() {
  state.currentIndex = Math.max(0, state.currentIndex - 1);
  state.currentTime = 0;
  loadCurrentSong({ autoplay: true });
  emit();
}

export function seek(seconds) {
  state.controller?.seekTo(seconds);
  state.currentTime = seconds;
  emit();
}

export function setTime(seconds) {
  state.currentTime = seconds;
  emit();
}

export function setDuration(seconds) {
  state.duration = seconds;
  emit();
}

export function currentSong() {
  return state.queue[state.currentIndex] || null;
}

function loadCurrentSong({ autoplay = false } = {}) {
  const song = currentSong();
  if (!playableSong(song)) {
    state.controller?.pause?.();
    state.status = "unavailable";
    state.duration = parseISODurationSeconds(song?.duration);
    console.info("Song is not playable", {
      trackId: song?.trackId,
      isAvailable: song?.isAvailable,
      audioUrl: song?.audioUrl,
    });
    return;
  }
  state.status = "loading";
  state.duration = parseISODurationSeconds(song.duration);
  state.controller?.load?.(song);
  if (autoplay) {
    state.controller?.play?.();
  }
}

function playableSong(song) {
  return Boolean(song?.trackId && song?.isAvailable !== false);
}

function parseISODurationSeconds(duration) {
  if (!duration) return 0;
  const match = String(duration).match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  return (Number(match[1] || 0) * 3600) + (Number(match[2] || 0) * 60) + Number(match[3] || 0);
}
