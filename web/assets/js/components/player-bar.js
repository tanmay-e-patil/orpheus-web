import { currentSong, getPlayerState, next, pause, play, playerStore, prev, seek } from "../player-store.js";
import { icon } from "../icons.js";
import { el } from "../store.js";
import { withViewTransition } from "../view-transitions.js";

export class PlayerBar extends HTMLElement {
  connectedCallback() {
    this.unsubscribe = () => this.sync();
    this.resizeObserver = new ResizeObserver(() => this.updatePlayerHeight());
    this.resizeObserver.observe(this);
    playerStore.addEventListener("change", this.unsubscribe);
    this.sync();
  }

  disconnectedCallback() {
    if (this.unsubscribe) playerStore.removeEventListener("change", this.unsubscribe);
    this.resizeObserver?.disconnect();
    document.body.classList.remove("has-player");
    document.documentElement.style.removeProperty("--player-height");
  }

  sync() {
    const state = getPlayerState();
    const song = currentSong();
    document.body.classList.toggle("has-player", Boolean(song));
    this.hidden = !song;
    if (!song) {
      this.replaceChildren();
      this.currentTrackId = null;
      this.updatePlayerHeight();
      return;
    }
    if (this.currentTrackId !== song.trackId) {
      this.currentTrackId = song.trackId;
      this.render(song);
    }
    this.updatePlaybackState(state);
    this.updatePlayerHeight();
  }

  render(song) {
    const progress = el("input", {
      class: "seek",
      type: "range",
      min: "0",
      max: "1",
      value: "0",
      "aria-label": "Seek",
    });
    progress.addEventListener("input", () => seek(Number(progress.value)));
    const toggle = el("button", { class: "icon-button player-toggle", type: "button", "aria-label": "Play" }, [
      icon("play", { size: 22 }),
    ]);
    toggle.addEventListener("click", (event) => {
      event.stopPropagation();
      isActivePlayback(getPlayerState().status) ? pause() : play();
    });
    const elapsed = el("span", { class: "player-time", text: "0:00" });
    const total = el("span", { class: "player-time", text: "0:00" });
    const bar = el("div", { class: "player-bar-inner" }, [
      el("div", { class: "player-meta" }, [
        song.albumArt ? el("img", { src: song.albumArt, alt: "", loading: "lazy" }) : el("div", { class: "album-placeholder" }),
        el("div", {}, [
          el("strong", { text: song.name }),
          el("span", { class: "muted", text: song.artistName }),
        ]),
      ]),
      el("div", { class: "player-seek-zone" }, [
        progress,
        el("div", { class: "player-time-row" }, [elapsed, total]),
      ]),
      el("div", { class: "player-actions" }, [
        el("button", { class: "button secondary player-lyrics-button", type: "button", text: "Lyrics", onclick: () => document.getElementById("lyrics-overlay")?.showModal() }),
        el("div", { class: "player-controls" }, [
          !isPlayable(song) ? el("span", { class: "player-status muted", text: "Unavailable" }) : null,
          el("button", { class: "icon-button", type: "button", "aria-label": "Previous", onclick: (e) => { e.stopPropagation(); transitionSongChange(prev, "prev"); } }, [
            icon("skip-back"),
          ]),
          toggle,
          el("button", { class: "icon-button", type: "button", "aria-label": "Next", onclick: (e) => { e.stopPropagation(); transitionSongChange(next, "next"); } }, [
            icon("skip-forward"),
          ]),
        ]),
        el("button", {
          class: "youtube-link",
          type: "button",
          "aria-label": "Edit song",
          onclick: (e) => { e.stopPropagation(); window.Orpheus?.router?.go(`/songs/${encodeURIComponent(song.trackId)}/edit`); },
        }, [
          icon("edit"),
        ]),
        el("button", {
          class: "youtube-link",
          type: "button",
          "aria-label": "Play YouTube video",
          onclick: (e) => { e.stopPropagation(); window.dispatchEvent(new CustomEvent("orpheus:open-youtube-player")); },
        }, [
          icon("youtube"),
        ]),
      ]),
    ]);
    this.progress = progress;
    this.toggle = toggle;
    this.elapsed = elapsed;
    this.total = total;
    this.renderedStatus = null;
    this.replaceChildren(bar);
    this.updatePlayerHeight();
  }

  updatePlaybackState(state) {
    if (this.progress) {
      const duration = Math.max(1, state.duration || 1);
      const currentTime = Math.min(state.currentTime || 0, duration);
      this.progress.max = String(duration);
      this.progress.value = String(currentTime);
      const loading = state.status === "loading";
      this.progress.style.setProperty("--seek-progress", `${(currentTime / duration) * 100}%`);
      this.progress.classList.toggle("is-loading", loading);
      this.progress.toggleAttribute("aria-busy", loading);
      this.progress.disabled = !isPlayable(currentSong());
      if (this.elapsed) this.elapsed.textContent = formatTime(currentTime);
      if (this.total) this.total.textContent = formatTime(state.duration || 0);
    }
    if (this.toggle && this.renderedStatus !== state.status) {
      const isPlaying = isActivePlayback(state.status);
      this.renderedStatus = state.status;
      this.toggle.classList.toggle("is-playing", isPlaying);
      this.toggle.disabled = !isPlayable(currentSong());
      this.toggle.setAttribute("aria-label", isPlaying ? "Pause" : "Play");
      this.toggle.replaceChildren(icon(isPlaying ? "pause" : "play", { size: 22 }));
    }
  }

  updatePlayerHeight() {
    const height = this.hidden ? 0 : Math.ceil(this.getBoundingClientRect().height);
    if (height > 0) document.documentElement.style.setProperty("--player-height", `${height}px`);
  }
}

function formatTime(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secondsPart = String(total % 60).padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${secondsPart}` : `${minutes}:${secondsPart}`;
}

function isActivePlayback(status) {
  return status === "playing" || status === "loading";
}

function isPlayable(song) {
  return Boolean(song?.trackId && song?.isAvailable !== false);
}

async function transitionSongChange(action, songKind) {
  await withViewTransition(() => {
    action();
  }, {
    scope: "song",
    songKind,
  });
}

customElements.define("player-bar", PlayerBar);
