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
          ...(this.showPlayCount ? [el("th", { class: "song-plays-cell", text: "Plays" })] : []),
          el("th", { class: "song-duration-cell", text: "Duration" }),
          el("th", { class: "song-actions-cell", text: "Actions" }),
        ]),
      ]),
    ]);
    const tbody = el("tbody");
    const list = el("div", { class: "song-list" });
    if (this.loading && !songs.length) {
      renderSkeletonRows(tbody, list, this.showPlayCount);
      table.append(tbody);
      this.replaceChildren(table, list);
      return;
    }
    if (!songs.length) {
      renderEmptyState(tbody, list, this.emptyMessage, this.showPlayCount ? 6 : 5, this.emptyAction, () => this.dispatchEvent(new CustomEvent("emptyaction")));
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
      const editPath = `/songs/${encodeURIComponent(song.trackId)}/edit`;
      const editLink = () => el("a", {
        class: "button secondary song-edit-action",
        href: editPath,
        "data-link": "",
        "aria-label": `Edit ${song.name}`,
        text: "Edit",
        onclick: (event) => {
          event.stopPropagation();
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          event.preventDefault();
          window.Orpheus.router.go(editPath);
        },
        onkeydown: (event) => event.stopPropagation(),
        onpointerdown: (event) => event.stopPropagation(),
      });
      const unavailable = song.isAvailable === false;
      const rowClass = unavailable ? "unavailable" : "";
      const status = unavailable ? "Unavailable" : formatDuration(song.duration);
      const art = song.albumArt ? el("img", { src: song.albumArt, alt: "", loading: "lazy" }) : el("div", { class: "album-placeholder" });
      art.addEventListener?.("error", () => this.dispatchEvent(new CustomEvent("albumartfailed", { detail: song.trackId, bubbles: true })));
      const row = el("tr", { class: rowClass, tabindex: "0", onpointerdown: preloadSongVideo, onclick: selectSong }, [
        el("td", {}, [el("div", { class: "track-cell" }, [art, el("span", { text: song.name })])]),
        el("td", { text: song.artistName }),
        el("td", { text: song.albumName }),
        ...(this.showPlayCount ? [el("td", { class: "song-plays-cell", text: String(song.playCount || 0) })] : []),
        el("td", { class: "song-duration-cell", text: status }),
        el("td", { class: "song-actions-cell" }, [editLink()]),
      ]);
      row.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        selectSong();
      });
      tbody.append(row);
      const mobileArt = song.albumArt ? el("img", { src: song.albumArt, alt: "", loading: "lazy" }) : el("div", { class: "album-placeholder" });
      mobileArt.addEventListener?.("error", () => this.dispatchEvent(new CustomEvent("albumartfailed", { detail: song.trackId, bubbles: true })));
      list.append(el("div", { class: `song-list-row ${rowClass}`.trim() }, [el("button", { class: `song-list-item ${rowClass}`.trim(), type: "button", onpointerdown: preloadSongVideo, onclick: selectSong }, [
        mobileArt,
        el("span", {}, [
          el("strong", { text: song.name }),
          el("span", { class: "muted", text: `${song.artistName} · ${song.albumName}${this.showPlayCount ? ` · ${song.playCount || 0} plays` : ""}${unavailable ? " · Unavailable" : ""}` }),
        ]),
      ]), editLink()]));
    });
    table.append(tbody);
    this.replaceChildren(table, list);
  }
}

function renderEmptyState(tbody, list, message, colspan, action, onAction) {
  const content = () => [
    el("p", { text: message }),
    action ? el("button", { class: "button secondary", type: "button", text: action, onclick: onAction }) : null,
  ];
  tbody.append(el("tr", { class: "song-empty-state" }, [
    el("td", { colspan }, content()),
  ]));
  list.append(el("div", { class: "song-empty-state" }, content()));
}

function renderSkeletonRows(tbody, list, showPlayCount) {
  for (let index = 0; index < 10; index += 1) {
    tbody.append(el("tr", { class: "skeleton-row", "aria-hidden": "true" }, [
      el("td", {}, [el("div", { class: "track-cell" }, [
        el("span", { class: "skeleton skeleton-art" }),
        el("span", { class: "skeleton skeleton-text wide" }),
      ])]),
      el("td", {}, [el("span", { class: "skeleton skeleton-text medium" })]),
      el("td", {}, [el("span", { class: "skeleton skeleton-text wide" })]),
      ...(showPlayCount ? [el("td")] : []),
      el("td", {}, [el("span", { class: "skeleton skeleton-text short" })]),
      el("td", { class: "song-actions-cell" }),
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
