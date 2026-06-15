import { currentSong, getPlayerState, pause, play, playerStore, seek } from "../player-store.js";
import { el, toast } from "../store.js";

const SYNC_INTERVAL_MS = 750;
const MAX_DRIFT_SECONDS = 0.75;
const PRELOAD_PLAY_TIMEOUT_MS = 3000;

let apiPromise = null;

export class YouTubePlayerModal extends HTMLElement {
  connectedCallback() {
    this.sync = () => {
      this.updateControls();
      this.syncWithAudio();
    };
    this.render();
    playerStore.addEventListener("change", this.sync);
    window.addEventListener("orpheus:open-youtube-player", this.onOpen = () => this.open());
    window.addEventListener("orpheus:preload-youtube-player", this.onPreload = (event) => this.preload(event.detail));
  }

  disconnectedCallback() {
    playerStore.removeEventListener("change", this.sync);
    window.removeEventListener("orpheus:open-youtube-player", this.onOpen);
    window.removeEventListener("orpheus:preload-youtube-player", this.onPreload);
    this.stopSyncLoop();
    this.player?.destroy?.();
  }

  render() {
    this.mount = el("div", { class: "youtube-player-frame" });
    this.titleNode = el("h2", { text: "YouTube video" });
    this.seekInput = el("input", { class: "youtube-player-seek", type: "range", min: "0", max: "1", value: "0", "aria-label": "Seek audio" });
    this.seekInput.addEventListener("input", () => seek(Number(this.seekInput.value)));
    this.playButton = el("button", { class: "button secondary", type: "button", onclick: () => {
      const status = getPlayerState().status;
      status === "playing" || status === "loading" ? pause() : play();
    } });
    this.timeLabel = el("span", { class: "muted youtube-player-time", text: "0:00 / 0:00" });
    this.dialog = el("dialog", { class: "youtube-player-modal", "aria-label": "YouTube video player" }, [
      el("div", { class: "dialog-header" }, [
        this.titleNode,
        el("button", { class: "icon-button", type: "button", "aria-label": "Close YouTube video", onclick: () => this.dialog.close() }, ["×"]),
      ]),
      this.mount,
      el("div", { class: "youtube-player-controls" }, [
        this.seekInput,
        el("div", { class: "youtube-player-controls-row" }, [this.playButton, this.timeLabel]),
      ]),
      el("p", { class: "muted youtube-player-note", text: "Video controls are hidden. Use these Orpheus controls; audio continues from the server." }),
    ]);
    this.dialog.addEventListener("close", () => {
      this.active = false;
      this.stopSyncLoop();
      this.player?.pauseVideo?.();
    });
    this.replaceChildren(this.dialog);
  }

  preload(detail = {}) {
    const song = currentSong();
    const videoId = detail.videoId || song?.youtubeVideoId;
    if (!videoId || videoId === this.videoId) return;
    this.loadVideo(videoId, { warmUntilPlaying: true }).catch((error) => {
      console.warn("Unable to preload YouTube player", error);
    });
  }

  async open() {
    const song = currentSong();
    if (!song?.youtubeVideoId) {
      toast("No YouTube video is linked for this track.", "error");
      return;
    }
    this.active = true;
    this.titleNode.textContent = song.name || "YouTube video";
    if (!this.dialog.open) this.dialog.showModal();

    if (isActivePlayback(getPlayerState().status)) pause();

    try {
      await this.loadVideo(song.youtubeVideoId);
      this.syncWithAudio({ forceSeek: true });
      play();
      this.syncWithAudio({ forceSeek: true, forcePlay: true });
      this.updateControls();
      this.startSyncLoop();
    } catch (error) {
      console.warn("Unable to open YouTube player", error);
      toast("Unable to open YouTube video.", "error");
    }
  }

  async loadVideo(videoId, options = {}) {
    const YT = await loadYouTubeAPI();
    if (this.videoId === videoId && this.player) {
      if (options.warmUntilPlaying) await this.warmPlayerUntilPlaying();
      return;
    }
    if (this.loadingVideoId === videoId && this.loadingPromise) return this.loadingPromise;

    this.loadingVideoId = videoId;
    this.loadingPromise = new Promise((resolve) => {
      this.player?.destroy?.();
      this.videoId = videoId;
      this.mount.replaceChildren();
      const container = el("div");
      this.mount.append(container);
      this.player = new YT.Player(container, {
        width: "100%",
        height: "100%",
        videoId,
        playerVars: {
          autoplay: options.warmUntilPlaying ? 1 : 0,
          controls: 0,
          disablekb: 0,
          modestbranding: 1,
          playsinline: 1,
          rel: 0,
          mute: 1,
        },
        events: {
          onReady: async () => {
            this.player.getIframe?.()?.setAttribute("allowfullscreen", "");
            this.ensureMuted();
            if (options.warmUntilPlaying) await this.warmPlayerUntilPlaying();
            resolve();
          },
          onStateChange: (event) => this.playerStateChange?.(event),
        },
      });
    }).finally(() => {
      this.loadingVideoId = null;
      this.loadingPromise = null;
    });
    return this.loadingPromise;
  }

  warmPlayerUntilPlaying() {
    if (!this.player) return Promise.resolve();
    this.ensureMuted();
    return new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        playerStore.removeEventListener("change", onAudioChange);
        this.playerStateChange = previousStateChange;
        resolve();
      };
      const onAudioChange = () => this.ensureMuted();
      const previousStateChange = this.playerStateChange;
      this.playerStateChange = (event) => {
        previousStateChange?.(event);
        if (event.data === window.YT?.PlayerState?.PLAYING) finish();
      };
      const timeout = window.setTimeout(finish, PRELOAD_PLAY_TIMEOUT_MS);
      playerStore.addEventListener("change", onAudioChange);
      this.player.playVideo?.();
      if (this.player.getPlayerState?.() === window.YT?.PlayerState?.PLAYING) finish();
    });
  }

  syncWithAudio(options = {}) {
    if (!this.active || !this.player) return;
    const state = getPlayerState();
    const song = currentSong();
    if (song?.youtubeVideoId && song.youtubeVideoId !== this.videoId) {
      this.loadVideo(song.youtubeVideoId).then(() => this.syncWithAudio({ forceSeek: true, forcePlay: state.status === "playing" }));
      return;
    }

    const audioTime = Number(state.currentTime) || 0;
    const videoTime = Number(this.player.getCurrentTime?.()) || 0;
    const drift = Math.abs(videoTime - audioTime);
    if (options.forceSeek) this.ensureMuted();
    if (options.forceSeek || drift > MAX_DRIFT_SECONDS) {
      this.player.seekTo?.(audioTime, true);
    }
    if (options.forcePlay || state.status === "playing" || state.status === "loading") {
      this.player.playVideo?.();
    } else if (state.status === "paused" || state.status === "ended" || state.status === "idle") {
      this.player.pauseVideo?.();
    }
  }

  updateControls() {
    if (!this.seekInput || !this.playButton || !this.timeLabel) return;
    const state = getPlayerState();
    const duration = Math.max(1, Number(state.duration) || 1);
    const currentTime = Math.min(Number(state.currentTime) || 0, duration);
    this.seekInput.max = String(duration);
    this.seekInput.value = String(currentTime);
    this.seekInput.style.setProperty("--seek-progress", `${(currentTime / duration) * 100}%`);
    const isPlaying = state.status === "playing" || state.status === "loading";
    this.playButton.textContent = isPlaying ? "Pause" : "Play";
    this.timeLabel.textContent = `${formatTime(currentTime)} / ${formatTime(duration)}`;
  }

  ensureMuted() {
    if (!this.player) return;
    if (!this.player.isMuted?.()) this.player.mute?.();
  }

  startSyncLoop() {
    if (this.syncTimer) return;
    this.syncTimer = window.setInterval(() => this.syncWithAudio(), SYNC_INTERVAL_MS);
  }

  stopSyncLoop() {
    if (!this.syncTimer) return;
    window.clearInterval(this.syncTimer);
    this.syncTimer = 0;
  }
}

function isActivePlayback(status) {
  return status === "playing" || status === "loading";
}

function formatTime(seconds) {
  const value = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(value / 60);
  const remaining = Math.floor(value % 60).toString().padStart(2, "0");
  return `${minutes}:${remaining}`;
}

function loadYouTubeAPI() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve) => {
    const previousReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previousReady?.();
      resolve(window.YT);
    };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    document.head.append(script);
  });
  return apiPromise;
}

customElements.define("youtube-player-modal", YouTubePlayerModal);
