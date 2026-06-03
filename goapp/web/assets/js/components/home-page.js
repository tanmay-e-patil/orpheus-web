import { API } from "../api.js";
import { readAllCachedSongs, readSongsCache, readSongsCacheMeta, upsertSongsPage, writeSongsCacheMeta } from "../idb-song-cache.js";
import { currentSong, setQueue, updateSongAlbumArt } from "../player-store.js";
import { appState, el, showDialog, toast } from "../store.js";
import { withViewTransition } from "../view-transitions.js";

const SEARCH_DEBOUNCE_MS = 120;

export class HomePage extends HTMLElement {
  connectedCallback() {
    this.pages = [];
    this.visibleSongs = [];
    this.searchableSongs = [];
    this.searchQuery = new URLSearchParams(window.location.search).get("q") || "";
    this.sort = new URLSearchParams(window.location.search).get("sort") === "mostPlayed" ? "mostPlayed" : "artist";
    this.cacheComplete = false;
    this.hydratingCache = false;
    this.loading = false;
    this.failedArt = new Set();
    this.hydrationController = null;
    this.focusSearch = () => {
      this.searchInput?.focus({ preventScroll: true });
      this.searchInput?.select();
    };
    this.renderShell();
    this.playRecorded = (event) => this.updateRecordedPlay(event.detail);
    window.addEventListener("orpheus:focus-track-search", this.focusSearch);
    window.addEventListener("orpheus:song-play-recorded", this.playRecorded);
    this.load();
  }

  disconnectedCallback() {
    this.observer?.disconnect();
    clearTimeout(this.refreshTimer);
    clearTimeout(this.searchTimer);
    this.hydrationController?.abort();
    window.removeEventListener("orpheus:focus-track-search", this.focusSearch);
    window.removeEventListener("orpheus:song-play-recorded", this.playRecorded);
  }

  renderShell() {
    this.table = document.createElement("song-table");
    this.table.loading = true;
    this.table.emptyMessage = this.searchQuery ? "Searching full library..." : "No tracks";
    this.searchInput = el("input", {
      class: "input",
      type: "search",
      value: this.searchQuery,
      placeholder: "Search tracks, artists, albums, lyrics...",
      "aria-label": "Search tracks",
    });
    this.searchStatus = el("span", { class: "track-search-status muted" });
    this.sortSelect = el("select", { class: "input track-sort-select", "aria-label": "Sort tracks" }, [
      el("option", { value: "artist", text: "Artist A-Z", selected: this.sort === "artist" }),
      el("option", { value: "mostPlayed", text: "Most played", selected: this.sort === "mostPlayed" }),
    ]);
    this.boundary = el("div", { class: "scroll-boundary" });
    this.replaceChildren(el("section", { class: "page home-page" }, [
      el("div", { class: "page-header" }, [
        el("h1", { text: "Tracks" }),
        el("p", { class: "muted", text: "Your personal music library" }),
      ]),
      el("div", { class: "track-search-row" }, [
        el("label", { class: "track-search-field" }, [
          this.searchInput,
          el("kbd", { class: "track-search-shortcut", text: "Cmd + K" }),
        ]),
        this.sortSelect,
        this.searchStatus,
      ]),
      this.table,
      this.boundary,
    ]));
    this.addEventListener("albumartfailed", (event) => this.queueAlbumArtRefresh(event.detail));
    this.addEventListener("songselected", (event) => this.playSelectedSong(event.detail));
    this.sortSelect.addEventListener("change", () => {
      this.sort = this.sortSelect.value === "mostPlayed" ? "mostPlayed" : "artist";
      this.updateSearchURL();
      this.load();
    });
    this.searchInput.addEventListener("input", () => {
      this.searchQuery = this.searchInput.value;
      clearTimeout(this.searchTimer);
      this.searchTimer = setTimeout(() => {
        this.updateSearchURL();
        this.applySearch();
      }, SEARCH_DEBOUNCE_MS);
    });
    this.searchInput.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      if (this.searchInput.value) {
        event.preventDefault();
        this.searchInput.value = "";
        this.searchQuery = "";
        clearTimeout(this.searchTimer);
        this.updateSearchURL();
        this.applySearch();
      } else {
        this.searchInput.blur();
      }
    });
    this.observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) this.loadMore();
    });
    this.observer.observe(this.boundary);
  }

  async load() {
    const userId = appState.session?.user?.id || "single-user";
    this.hydrationController?.abort();
    this.pages = [];
    this.visibleSongs = [];
    this.searchableSongs = [];
    this.cacheComplete = false;
    this.table.loading = true;
    const useCache = this.sort === "artist";
    const cached = useCache ? await readSongsCache(userId).catch(() => null) : null;
    const [allCached, cacheMeta] = await Promise.all([
      useCache ? readAllCachedSongs(userId).catch(() => []) : Promise.resolve([]),
      useCache ? readSongsCacheMeta(userId).catch(() => null) : Promise.resolve(null),
    ]);
    this.cacheComplete = Boolean(cacheMeta?.complete);
    if (cached?.songs?.length) {
      this.pages = cached.pages || [];
      this.visibleSongs = cached.songs;
      this.searchableSongs = mergeSongs(allCached.length ? allCached : cached.songs);
      this.applySearch();
    }
    try {
      const first = await API.songs(null, 50, undefined, this.sort);
      if (!this.isConnected) return;
      this.pages = [{ cursorIn: null, ...first }];
      this.visibleSongs = this.cacheComplete && this.searchableSongs.length ? mergeSongs(this.searchableSongs, first.songs) : first.songs;
      this.searchableSongs = mergeSongs(this.searchableSongs, first.songs);
      this.cacheComplete = !first.hasMore;
      this.applySearch();
      if (useCache) await upsertSongsPage(userId, null, first);
      if (!this.isConnected) return;
      if (useCache) await writeSongsCacheMeta(userId, {
        complete: !first.hasMore,
        completedAt: first.hasMore ? null : Date.now(),
        lastCursor: first.nextCursor || null,
      });
      if (!this.isConnected) return;
      if (useCache) this.hydrateSongCache(userId);
    } catch (error) {
      if (error.name !== "AbortError") showDialog(error.message || "Could not load songs");
    } finally {
      this.table.loading = false;
      if (this.isConnected) this.applySearch();
    }
  }

  async loadMore() {
    if (this.searchQuery.trim() || this.loading || this.hydratingCache) return;
    const last = this.pages[this.pages.length - 1];
    if (!last?.hasMore) return;
    this.loading = true;
    try {
      const page = await API.songs(last.nextCursor, 50, undefined, this.sort);
      if (!this.isConnected) return;
      this.pages.push({ cursorIn: last.nextCursor, ...page });
      this.visibleSongs = mergeSongs(...this.pages.map((candidate) => candidate.songs));
      this.searchableSongs = mergeSongs(this.searchableSongs, page.songs);
      this.cacheComplete = !page.hasMore;
      this.applySearch();
      if (this.sort === "artist") await upsertSongsPage(appState.session?.user?.id || "single-user", last.nextCursor, page);
      if (!this.isConnected) return;
      if (this.sort === "artist") await writeSongsCacheMeta(appState.session?.user?.id || "single-user", {
        complete: !page.hasMore,
        completedAt: page.hasMore ? null : Date.now(),
        lastCursor: page.nextCursor || null,
      });
    } catch (error) {
      toast(error.message || "Could not load more songs", "error");
    } finally {
      this.loading = false;
    }
  }

  async hydrateSongCache(userId) {
    if (this.hydratingCache || this.cacheComplete) return;
    let last = this.pages[this.pages.length - 1];
    if (!last?.hasMore) {
      this.cacheComplete = true;
      await writeSongsCacheMeta(userId, { complete: true, completedAt: Date.now(), lastCursor: last?.nextCursor || null }).catch(() => {});
      this.applySearch();
      return;
    }
    this.hydratingCache = true;
    this.hydrationController?.abort();
    this.hydrationController = new AbortController();
    this.applySearch();
    try {
      while (this.isConnected && last?.hasMore) {
        const cursorIn = last.nextCursor;
        const page = await API.songs(cursorIn, 50, this.hydrationController.signal, "artist");
        if (!this.isConnected) return;
        this.pages.push({ cursorIn, ...page });
        this.visibleSongs = mergeSongs(this.visibleSongs, page.songs);
        this.searchableSongs = mergeSongs(this.searchableSongs, page.songs);
        this.cacheComplete = !page.hasMore;
        this.applySearch();
        await upsertSongsPage(userId, cursorIn, page);
        if (!this.isConnected) return;
        await writeSongsCacheMeta(userId, {
          complete: !page.hasMore,
          completedAt: page.hasMore ? null : Date.now(),
          lastCursor: page.nextCursor || null,
        });
        if (!this.isConnected) return;
        last = { cursorIn, ...page };
      }
    } catch (error) {
      if (error.name !== "AbortError") {
        await writeSongsCacheMeta(userId, { complete: false, completedAt: null, lastCursor: last?.nextCursor || null }).catch(() => {});
        toast("Could not finish loading searchable library", "error");
      }
    } finally {
      this.hydratingCache = false;
      if (this.isConnected) this.applySearch();
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
          this.visibleSongs = this.visibleSongs.map((song) => song.trackId === id ? { ...song, albumArt: art } : song);
          this.searchableSongs = this.searchableSongs.map((song) => song.trackId === id ? { ...song, albumArt: art } : song);
          updateSongAlbumArt(id, art);
        }
        this.applySearch();
      } catch (error) {
        console.warn("album art refresh failed", error);
      }
    }, 300);
  }

  playSelectedSong(detail) {
    if (!detail?.trackId) return;
    if (!this.searchQuery.trim()) {
      this.setSelectedQueue(this.visibleSongs, detail.index, detail.trackId);
      return;
    }
    const index = this.searchableSongs.findIndex((song) => song.trackId === detail.trackId);
    if (index >= 0) this.setSelectedQueue(this.searchableSongs, index, detail.trackId);
  }

  async setSelectedQueue(queue, index, trackId) {
    if (currentSong()?.trackId === trackId) return;
    await withViewTransition(() => {
      setQueue(queue, index);
    }, {
      scope: "song",
      songKind: "select",
    });
  }

  applySearch() {
    this.table.showPlayCount = this.sort === "mostPlayed";
    const query = this.searchQuery.trim();
    if (!query) {
      this.table.emptyMessage = "No tracks";
      this.updateSearchStatus("");
      this.updateTableSongs(this.sortSongs(this.visibleSongs));
      return;
    }
    const results = this.sortSongs(filterSongs(this.searchableSongs, query));
    const searchingFullLibrary = this.hydratingCache || !this.cacheComplete;
    this.table.emptyMessage = searchingFullLibrary ? "Searching full library..." : "No matching tracks";
    this.updateSearchStatus(`${results.length} ${results.length === 1 ? "match" : "matches"}${searchingFullLibrary ? " - searching full library..." : ""}`);
    this.updateTableSongs(results);
  }

  updateSearchURL() {
    const url = new URL(window.location.href);
    const query = this.searchQuery.trim();
    if (query) url.searchParams.set("q", query);
    else url.searchParams.delete("q");
    if (this.sort === "mostPlayed") url.searchParams.set("sort", "mostPlayed");
    else url.searchParams.delete("sort");
    window.history.replaceState({}, "", url.pathname + url.search + url.hash);
  }

  updateSearchStatus(message) {
    if (this.searchStatus) this.searchStatus.textContent = message;
  }

  updateTableSongs(songs) {
    if (sameSongList(this.table.songs, songs)) return;
    this.table.songs = songs;
  }

  updateRecordedPlay(detail) {
    if (!detail?.trackId) return;
    const update = (song) => song.trackId === detail.trackId ? { ...song, playCount: detail.playCount } : song;
    this.visibleSongs = this.visibleSongs.map(update);
    this.searchableSongs = this.searchableSongs.map(update);
    this.pages = this.pages.map((page) => ({ ...page, songs: (page.songs || []).map(update) }));
    this.applySearch();
  }

  sortSongs(songs) {
    if (this.sort !== "mostPlayed") return songs;
    return [...songs].sort(compareMostPlayed);
  }
}

function sameSongList(a = [], b = []) {
  if (a.length !== b.length) return false;
  return a.every((song, index) => {
    const candidate = b[index];
    return candidate &&
      song.trackId === candidate.trackId &&
      song.name === candidate.name &&
      song.artistName === candidate.artistName &&
      song.albumName === candidate.albumName &&
      song.duration === candidate.duration &&
      song.albumArt === candidate.albumArt &&
      song.isAvailable === candidate.isAvailable &&
      song.audioUrl === candidate.audioUrl &&
      (song.playCount || 0) === (candidate.playCount || 0);
  });
}

function mergeSongs(...groups) {
  const byId = new Map();
  for (const group of groups) {
    for (const song of group || []) {
      if (!song?.trackId) continue;
      byId.set(song.trackId, { playCount: 0, ...(byId.get(song.trackId) || {}), ...song });
    }
  }
  return [...byId.values()];
}

function compareMostPlayed(a, b) {
  return (Number(b.playCount || 0) - Number(a.playCount || 0)) ||
    String(a.artistName || "").localeCompare(String(b.artistName || "")) ||
    String(a.name || "").localeCompare(String(b.name || "")) ||
    String(a.trackId || "").localeCompare(String(b.trackId || ""));
}

function filterSongs(songs, query) {
  const tokens = normalizeSearchText(query).split(" ").filter(Boolean);
  if (!tokens.length) return songs;
  return songs
    .map((song, index) => ({ song, index, priority: searchPriority(song, tokens) }))
    .filter((result) => result.priority < 3)
    .sort((a, b) => a.priority - b.priority || a.index - b.index)
    .map((result) => result.song);
}

function searchPriority(song, tokens) {
  const primary = normalizeSearchText([
    song.name,
    song.artistName,
    song.albumName,
  ].filter(Boolean).join(" "));
  const secondary = normalizeSearchText([
    song.trackId,
    song.youtubeVideoId,
  ].filter(Boolean).join(" "));
  const lyrics = normalizeSearchText([
    song.lyrics,
    song.syncedLyrics,
  ].filter(Boolean).join(" "));
  const all = [primary, secondary, lyrics].filter(Boolean).join(" ");
  if (!tokens.every((token) => all.includes(token))) return 3;
  if (tokens.every((token) => primary.includes(token))) return 0;
  if (tokens.every((token) => (primary + " " + secondary).includes(token))) return 1;
  return 2;
}

function normalizeSearchText(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

customElements.define("home-page", HomePage);
