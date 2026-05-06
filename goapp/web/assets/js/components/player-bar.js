import { currentSong, getPlayerState, next, pause, play, playerStore, prev, seek } from "../player-store.js";
import { el } from "../store.js";

export class PlayerBar extends HTMLElement {
  connectedCallback() {
    this.unsubscribe = () => this.render();
    playerStore.addEventListener("change", this.unsubscribe);
    this.render();
  }

  disconnectedCallback() {
    if (this.unsubscribe) playerStore.removeEventListener("change", this.unsubscribe);
  }

  render() {
    const state = getPlayerState();
    const song = currentSong();
    this.hidden = !song;
    if (!song) {
      this.replaceChildren();
      return;
    }
    const progress = el("input", {
      class: "seek",
      type: "range",
      min: "0",
      max: String(Math.max(1, state.duration || 1)),
      value: String(Math.min(state.currentTime || 0, state.duration || 1)),
      "aria-label": "Seek",
    });
    progress.addEventListener("input", () => seek(Number(progress.value)));
    const toggle = el("button", { class: "icon-button", type: "button", "aria-label": state.status === "playing" ? "Pause" : "Play", text: state.status === "playing" ? "Pause" : "Play" });
    toggle.addEventListener("click", (event) => {
      event.stopPropagation();
      state.status === "playing" ? pause() : play();
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
        el("button", { class: "icon-button", type: "button", "aria-label": "Previous", text: "Prev", onclick: (e) => { e.stopPropagation(); prev(); } }),
        toggle,
        el("button", { class: "icon-button", type: "button", "aria-label": "Next", text: "Next", onclick: (e) => { e.stopPropagation(); next(); } }),
      ]),
      el("a", { class: "youtube-link", href: `https://www.youtube.com/watch?v=${encodeURIComponent(song.youtubeVideoId)}`, target: "_blank", rel: "noopener noreferrer", text: "YouTube" }),
    ]);
    this.replaceChildren(bar);
  }
}

customElements.define("player-bar", PlayerBar);
