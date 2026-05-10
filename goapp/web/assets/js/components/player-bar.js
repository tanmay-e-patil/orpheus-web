import { currentSong, getPlayerState, next, pause, play, playerStore, prev, seek } from "../player-store.js";
import { icon } from "../icons.js";
import { el } from "../store.js";

export class PlayerBar extends HTMLElement {
  connectedCallback() {
    this.unsubscribe = () => this.sync();
    playerStore.addEventListener("change", this.unsubscribe);
    this.sync();
  }

  disconnectedCallback() {
    if (this.unsubscribe) playerStore.removeEventListener("change", this.unsubscribe);
  }

  sync() {
    const state = getPlayerState();
    const song = currentSong();
    this.hidden = !song;
    if (!song) {
      this.replaceChildren();
      this.currentTrackId = null;
      return;
    }
    if (this.currentTrackId !== song.trackId) {
      this.currentTrackId = song.trackId;
      this.render(song);
    }
    this.updatePlaybackState(state);
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
    const openLyrics = (event) => {
      if (event.target.closest("button,input,a")) return;
      document.getElementById("lyrics-overlay")?.showModal();
    };
    const bar = el("div", { class: "player-bar-inner", onclick: openLyrics }, [
      progress,
      el("div", { class: "player-meta" }, [
        song.albumArt ? el("img", { src: song.albumArt, alt: "", loading: "lazy" }) : el("div", { class: "album-placeholder" }),
        el("div", {}, [
          el("strong", { text: song.name }),
          el("span", { class: "muted", text: song.artistName }),
        ]),
      ]),
      el("div", { class: "player-controls" }, [
        !isPlayable(song) ? el("span", { class: "player-status muted", text: "Unavailable" }) : null,
        el("button", { class: "icon-button", type: "button", "aria-label": "Previous", onclick: (e) => { e.stopPropagation(); prev(); } }, [
          icon("skip-back"),
        ]),
        toggle,
        el("button", { class: "icon-button", type: "button", "aria-label": "Next", onclick: (e) => { e.stopPropagation(); next(); } }, [
          icon("skip-forward"),
        ]),
      ]),
      el("a", { class: "youtube-link", href: `https://www.youtube.com/watch?v=${encodeURIComponent(song.youtubeVideoId)}`, target: "_blank", rel: "noopener noreferrer", "aria-label": "Open source on YouTube" }, [
        icon("youtube"),
      ]),
    ]);
    this.progress = progress;
    this.toggle = toggle;
    this.renderedStatus = null;
    this.replaceChildren(bar);
  }

  updatePlaybackState(state) {
    if (this.progress) {
      const duration = Math.max(1, state.duration || 1);
      this.progress.max = String(duration);
      this.progress.value = String(Math.min(state.currentTime || 0, duration));
      this.progress.disabled = !isPlayable(currentSong());
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
}

function isActivePlayback(status) {
  return status === "playing" || status === "loading";
}

function isPlayable(song) {
  return Boolean(song?.trackId && song?.isAvailable !== false);
}

customElements.define("player-bar", PlayerBar);
