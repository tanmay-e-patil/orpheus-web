import { setQueue } from "../player-store.js";
import { el } from "../store.js";

export class SongTable extends HTMLElement {
  set songs(value) {
    this._songs = value || [];
    this.render();
  }

  get songs() {
    return this._songs || [];
  }

  connectedCallback() {
    this.render();
  }

  render() {
    const table = el("table", { class: "song-table" }, [
      el("thead", {}, [
        el("tr", {}, [
          el("th", { text: "Track" }),
          el("th", { text: "Artist" }),
          el("th", { text: "Album" }),
          el("th", { text: "Duration" }),
        ]),
      ]),
    ]);
    const tbody = el("tbody");
    const list = el("div", { class: "song-list" });
    this.songs.forEach((song, index) => {
      const playSong = () => setQueue(this.songs, index);
      const art = song.albumArt ? el("img", { src: song.albumArt, alt: "", loading: "lazy" }) : el("div", { class: "album-placeholder" });
      art.addEventListener?.("error", () => this.dispatchEvent(new CustomEvent("albumartfailed", { detail: song.trackId, bubbles: true })));
      tbody.append(el("tr", { tabindex: "0", onclick: playSong }, [
        el("td", {}, [el("div", { class: "track-cell" }, [art.cloneNode(true), el("span", { text: song.name })])]),
        el("td", { text: song.artistName }),
        el("td", { text: song.albumName }),
        el("td", { text: formatDuration(song.duration) }),
      ]));
      const mobileArt = song.albumArt ? el("img", { src: song.albumArt, alt: "", loading: "lazy" }) : el("div", { class: "album-placeholder" });
      mobileArt.addEventListener?.("error", () => this.dispatchEvent(new CustomEvent("albumartfailed", { detail: song.trackId, bubbles: true })));
      list.append(el("button", { class: "song-list-item", type: "button", onclick: playSong }, [
        mobileArt,
        el("span", {}, [
          el("strong", { text: song.name }),
          el("span", { class: "muted", text: `${song.artistName} · ${song.albumName}` }),
        ]),
      ]));
    });
    table.append(tbody);
    this.replaceChildren(table, list);
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
