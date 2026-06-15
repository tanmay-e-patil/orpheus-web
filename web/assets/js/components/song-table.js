import { el } from "../store.js";

export class SongTable extends HTMLElement {
  set songs(value) {
    this._songs = value || [];
    this.render();
  }

  get songs() {
    return this._songs || [];
  }

  set showPlayCount(value) {
    const previous = this.showPlayCount;
    this._showPlayCount = Boolean(value);
    if (previous !== this.showPlayCount) this.render();
  }

  get showPlayCount() {
    return Boolean(this._showPlayCount);
  }

  set loading(value) {
    const previous = this.loading;
    this._loading = Boolean(value);
    if (previous !== this.loading && !this.songs.length) this.render();
  }

  get loading() {
    return Boolean(this._loading);
  }

  set emptyMessage(value) {
    this._emptyMessage = value || "No tracks";
    if (!this.loading && !this.songs.length) this.render();
  }

  get emptyMessage() {
    return this._emptyMessage || "No tracks";
  }

  connectedCallback() {
    this.render();
  }

  render() {
    const songs = this.songs;
    const table = el("table", { class: "song-table" }, [
      el("thead", {}, [
        el("tr", {}, [
          el("th", { text: "Track" }),
          el("th", { text: "Artist" }),
          el("th", { text: "Album" }),
          ...(this.showPlayCount ? [el("th", { text: "Plays" })] : []),
          el("th", { text: "Duration" }),
        ]),
      ]),
    ]);
    const tbody = el("tbody");
    const list = el("div", { class: "song-list" });
    if (this.loading && !songs.length) {
      renderSkeletonRows(tbody, list);
      this.replaceChildren(table, list);
      return;
    }
    if (!songs.length) {
      renderEmptyState(tbody, list, this.emptyMessage);
      table.append(tbody);
      this.replaceChildren(table, list);
      return;
    }
    songs.forEach((song, index) => {
      const preloadSongVideo = () => {
        if (!song.youtubeVideoId) return;
        window.dispatchEvent(new CustomEvent("orpheus:preload-youtube-player", {
          detail: { videoId: song.youtubeVideoId },
        }));
      };
      const selectSong = () => {
        preloadSongVideo();
        this.dispatchEvent(new CustomEvent("songselected", {
          detail: { trackId: song.trackId, index, song },
          bubbles: true,
        }));
      };
      const unavailable = song.isAvailable === false;
      const rowClass = unavailable ? "unavailable" : "";
      const status = unavailable ? "Unavailable" : formatDuration(song.duration);
      const art = song.albumArt ? el("img", { src: song.albumArt, alt: "", loading: "lazy" }) : el("div", { class: "album-placeholder" });
      art.addEventListener?.("error", () => this.dispatchEvent(new CustomEvent("albumartfailed", { detail: song.trackId, bubbles: true })));
      const row = el("tr", { class: rowClass, tabindex: "0", onpointerdown: preloadSongVideo, onclick: selectSong }, [
        el("td", {}, [el("div", { class: "track-cell" }, [art.cloneNode(true), el("span", { text: song.name })])]),
        el("td", { text: song.artistName }),
        el("td", { text: song.albumName }),
        ...(this.showPlayCount ? [el("td", { text: String(song.playCount || 0) })] : []),
        el("td", { text: status }),
      ]);
      row.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        selectSong();
      });
      tbody.append(row);
      const mobileArt = song.albumArt ? el("img", { src: song.albumArt, alt: "", loading: "lazy" }) : el("div", { class: "album-placeholder" });
      mobileArt.addEventListener?.("error", () => this.dispatchEvent(new CustomEvent("albumartfailed", { detail: song.trackId, bubbles: true })));
      list.append(el("button", { class: `song-list-item ${rowClass}`.trim(), type: "button", onpointerdown: preloadSongVideo, onclick: selectSong }, [
        mobileArt,
        el("span", {}, [
          el("strong", { text: song.name }),
          el("span", { class: "muted", text: `${song.artistName} · ${song.albumName}${this.showPlayCount ? ` · ${song.playCount || 0} plays` : ""}${unavailable ? " · Unavailable" : ""}` }),
        ]),
      ]));
    });
    table.append(tbody);
    this.replaceChildren(table, list);
  }
}

function renderEmptyState(tbody, list, message) {
  tbody.append(el("tr", { class: "song-empty-state" }, [
    el("td", { colspan: "5", text: message }),
  ]));
  list.append(el("div", { class: "song-empty-state", text: message }));
}

function renderSkeletonRows(tbody, list) {
  for (let index = 0; index < 10; index += 1) {
    tbody.append(el("tr", { class: "skeleton-row", "aria-hidden": "true" }, [
      el("td", {}, [el("div", { class: "track-cell" }, [
        el("span", { class: "skeleton skeleton-art" }),
        el("span", { class: "skeleton skeleton-text wide" }),
      ])]),
      el("td", {}, [el("span", { class: "skeleton skeleton-text medium" })]),
      el("td", {}, [el("span", { class: "skeleton skeleton-text wide" })]),
      el("td", {}, [el("span", { class: "skeleton skeleton-text short" })]),
    ]));
    list.append(el("div", { class: "song-list-item skeleton-row", "aria-hidden": "true" }, [
      el("span", { class: "skeleton skeleton-art" }),
      el("span", {}, [
        el("span", { class: "skeleton skeleton-text wide" }),
        el("span", { class: "skeleton skeleton-text medium" }),
      ]),
    ]));
  }
}

function formatDuration(duration) {
  if (!duration) return "";
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return duration;
  const h = Number(match[1] || 0);
  const m = Number(match[2] || 0);
  const s = Number(match[3] || 0);
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

customElements.define("song-table", SongTable);
