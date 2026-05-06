import { API } from "../api.js";
import { readSongsCache, upsertSongsPage } from "../idb-song-cache.js";
import { updateSongAlbumArt } from "../player-store.js";
import { appState, el, showDialog, toast } from "../store.js";

export class HomePage extends HTMLElement {
  connectedCallback() {
    this.pages = [];
    this.songs = [];
    this.loading = false;
    this.failedArt = new Set();
    this.renderShell();
    this.load();
  }

  disconnectedCallback() {
    this.observer?.disconnect();
    clearTimeout(this.refreshTimer);
  }

  renderShell() {
    this.table = document.createElement("song-table");
    this.boundary = el("div", { class: "scroll-boundary" });
    this.replaceChildren(el("section", { class: "page home-page" }, [
      el("div", { class: "page-header" }, [
        el("h1", { text: "Tracks" }),
        el("p", { class: "muted", text: "Your personal music library" }),
      ]),
      this.table,
      this.boundary,
    ]));
    this.addEventListener("albumartfailed", (event) => this.queueAlbumArtRefresh(event.detail));
    this.observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) this.loadMore();
    });
    this.observer.observe(this.boundary);
  }

  async load() {
    const userId = appState.session?.user?.id || "single-user";
    const cached = await readSongsCache(userId).catch(() => null);
    if (cached?.songs?.length) {
      this.songs = cached.songs;
      this.table.songs = this.songs;
    }
    try {
      const first = await API.songs(null);
      this.pages = [{ cursorIn: null, ...first }];
      this.songs = first.songs;
      this.table.songs = this.songs;
      await upsertSongsPage(userId, null, first);
    } catch (error) {
      showDialog(error.message || "Could not load songs");
    }
  }

  async loadMore() {
    if (this.loading) return;
    const last = this.pages[this.pages.length - 1];
    if (!last?.hasMore) return;
    this.loading = true;
    try {
      const page = await API.songs(last.nextCursor);
      this.pages.push({ cursorIn: last.nextCursor, ...page });
      const seen = new Set();
      this.songs = this.pages.flatMap((candidate) => candidate.songs).filter((song) => {
        if (seen.has(song.trackId)) return false;
        seen.add(song.trackId);
        return true;
      });
      this.table.songs = this.songs;
      await upsertSongsPage(appState.session?.user?.id || "single-user", last.nextCursor, page);
    } catch (error) {
      toast(error.message || "Could not load more songs", "error");
    } finally {
      this.loading = false;
    }
  }

  queueAlbumArtRefresh(trackId) {
    this.failedArt.add(trackId);
    clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(async () => {
      const trackIds = [...this.failedArt];
      this.failedArt.clear();
      try {
        const result = await API.refreshAlbumArt(trackIds);
        for (const [id, art] of Object.entries(result.updated || {})) {
          this.songs = this.songs.map((song) => song.trackId === id ? { ...song, albumArt: art } : song);
          updateSongAlbumArt(id, art);
        }
        this.table.songs = this.songs;
      } catch (error) {
        console.warn("album art refresh failed", error);
      }
    }, 300);
  }
}

customElements.define("home-page", HomePage);
