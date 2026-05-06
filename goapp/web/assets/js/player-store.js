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
  state.controller?.pause?.();
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
  state.status = "loading";
  state.currentTime = 0;
  const videoId = queue[currentIndex]?.youtubeVideoId;
  if (state.controller && videoId) {
    state.controller.load(videoId);
    state.controller.play();
    state.status = "playing";
  }
  emit();
}

export function updateSongAlbumArt(trackId, albumArt) {
  state.queue = state.queue.map((song) => song.trackId === trackId ? { ...song, albumArt } : song);
  emit();
}

export function play() {
  state.controller?.play();
  state.status = "playing";
  emit();
}

export function pause() {
  state.controller?.pause();
  state.status = "paused";
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
  state.status = "loading";
  state.currentTime = 0;
  const videoId = state.queue[nextIndex]?.youtubeVideoId;
  if (state.controller && videoId) {
    state.controller.load(videoId);
    state.controller.play();
    state.status = "playing";
  }
  emit();
}

export function prev() {
  state.currentIndex = Math.max(0, state.currentIndex - 1);
  state.status = "loading";
  state.currentTime = 0;
  const videoId = state.queue[state.currentIndex]?.youtubeVideoId;
  if (state.controller && videoId) {
    state.controller.load(videoId);
    state.controller.play();
    state.status = "playing";
  }
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
