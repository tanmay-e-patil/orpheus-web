import { findActiveIndex, parseLRC } from "../lrc.js";
import { currentSong, getPlayerState, playerStore } from "../player-store.js";
import { el } from "../store.js";

export class LyricsView extends HTMLElement {
  connectedCallback() {
    this.onChange = () => this.render();
    playerStore.addEventListener("change", this.onChange);
    this.render();
  }

  disconnectedCallback() {
    if (this.onChange) playerStore.removeEventListener("change", this.onChange);
  }

  render() {
    const song = currentSong();
    if (!song) {
      this.replaceChildren(el("div", { class: "lyrics-empty", text: "Select a track to see lyrics." }));
      return;
    }
    const synced = parseLRC(song.syncedLyrics || "");
    if (synced.length) {
      const active = findActiveIndex(synced, getPlayerState().currentTime * 1000);
      const list = el("div", { class: "lyrics-lines" });
      synced.forEach((line, index) => {
        list.append(el("p", { class: index === active ? "active" : "", text: line.text }));
      });
      this.replaceChildren(el("div", { class: "lyrics-view" }, [
        el("h2", { text: song.name }),
        list,
      ]));
      list.querySelector(".active")?.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }
    if (song.lyrics) {
      this.replaceChildren(el("div", { class: "lyrics-view" }, [
        el("h2", { text: song.name }),
        el("pre", { text: song.lyrics }),
      ]));
      return;
    }
    this.replaceChildren(el("div", { class: "lyrics-empty", text: "No lyrics available." }));
  }
}

customElements.define("lyrics-view", LyricsView);
