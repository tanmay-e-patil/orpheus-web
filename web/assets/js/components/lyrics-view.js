import { findActiveIndex, parseLRC } from "../lrc.js";
import { API } from "../api.js";
import { currentSong, getPlayerState, playerStore, updateSongLyrics } from "../player-store.js";
import { el, toast } from "../store.js";

export class LyricsView extends HTMLElement {
  connectedCallback() {
    this.fetched = null;
    this.fetching = false;
    this.saving = false;
    this.abortController = null;
    this.lastTrackId = "";
    this.lookupComplete = false;
    this.activeIndex = -1;
    this.lineElements = [];
    this.songSignature = "";
    this.onChange = () => this.handlePlayerChange();
    playerStore.addEventListener("change", this.onChange);
    this.render();
  }

  disconnectedCallback() {
    if (this.onChange) playerStore.removeEventListener("change", this.onChange);
    this.abortController?.abort();
  }

  handlePlayerChange() {
    const song = currentSong();
    const signature = song ? songSignature(song, this.fetched) : "";
    if (song?.trackId === this.lastTrackId && signature === this.songSignature && this.lineElements.length) {
      this.updateActiveLine();
      return;
    }
    this.render();
  }

  render() {
    const song = currentSong();
    this.closest(".lyrics-panel-shell")?.toggleAttribute("hidden", !song);
    if (!song) {
      this.activeIndex = -1;
      this.lineElements = [];
      this.songSignature = "";
      this.replaceChildren();
      return;
    }
    if (song.trackId !== this.lastTrackId) {
      this.lastTrackId = song.trackId;
      this.fetched = null;
      this.fetching = false;
      this.saving = false;
      this.abortController?.abort();
      this.abortController = null;
      this.lookupComplete = false;
      this.activeIndex = -1;
      this.lineElements = [];
    }
    this.fetchMissingLyrics(song);
    this.songSignature = songSignature(song, this.fetched);

    const fetchedSynced = this.fetched?.syncedLyrics?.trim() ? this.fetched.syncedLyrics : "";
    const synced = parseLRC(fetchedSynced || song.syncedLyrics || "");
    const header = this.renderHeader(song);
    if (synced.length) {
      const list = el("div", { class: "lyrics-lines" });
      synced.forEach((line, index) => {
        list.append(el("p", { text: line.text }));
      });
      const children = [header];
      const bodyChildren = [];
      if (shouldOfferFetchedLyricsSave(song, this.fetched)) {
        bodyChildren.push(this.renderSavePrompt(song, "Preview from LRCLIB"));
      }
      bodyChildren.push(list);
      children.push(el("div", { class: "lyrics-body" }, bodyChildren));
      this.replaceChildren(el("div", { class: "lyrics-view" }, children));
      this.synced = synced;
      this.lineElements = [...list.querySelectorAll("p")];
      this.activeIndex = -1;
      this.updateActiveLine({ scroll: false });
      return;
    }

    this.activeIndex = -1;
    this.lineElements = [];
    this.synced = [];
    const plainLyrics = song.lyrics || this.fetched?.plainLyrics || "";
    if (plainLyrics || this.fetching) {
      const body = this.fetching && !plainLyrics ? "Looking up lyrics from LRCLIB..." : plainLyrics;
      const bodyChildren = [el("pre", { text: body })];
      if (shouldOfferFetchedLyricsSave(song, this.fetched)) {
        bodyChildren.push(this.renderSavePrompt(song, "Found lyrics from LRCLIB"));
      }
      this.replaceChildren(el("div", { class: "lyrics-view" }, [
        header,
        el("div", { class: "lyrics-body" }, bodyChildren),
      ]));
      return;
    }
    this.replaceChildren(el("div", { class: "lyrics-view" }, [
      header,
      el("div", { class: "lyrics-body" }, [
        el("div", { class: "lyrics-empty", text: "No lyrics available." }),
      ]),
    ]));
  }

  renderHeader(song) {
    return el("div", { class: "lyrics-header" }, [
      song.albumArt ? el("img", { src: song.albumArt, alt: "", loading: "lazy" }) : el("div", { class: "album-placeholder" }),
      el("div", {}, [
        el("h2", { text: song.name }),
        el("p", { class: "muted", text: song.artistName }),
      ]),
    ]);
  }

  renderSavePrompt(song, label) {
    return el("div", { class: "lyrics-save" }, [
      el("span", { class: "muted", text: label }),
      el("button", {
        class: "button secondary",
        type: "button",
        text: this.saving ? "Saving..." : "Save",
        disabled: this.saving,
        onclick: () => this.saveFetchedLyrics(song),
      }),
    ]);
  }

  fetchMissingLyrics(song) {
    if (this.fetching || this.lookupComplete || this.fetched || (song.lyrics && song.syncedLyrics)) return;
    if (!song.name || !song.artistName || !song.albumName || !song.duration) return;

    const controller = new AbortController();
    this.abortController = controller;
    this.fetching = true;
    API.lrclibExact({
      trackName: song.name,
      artistName: song.artistName,
      albumName: song.albumName,
      isoDuration: song.duration,
    }, controller.signal)
      .then((data) => {
        this.fetched = {
          plainLyrics: data?.plainLyrics || "",
          syncedLyrics: data?.syncedLyrics || "",
        };
      })
      .catch((error) => {
        if (error?.name !== "AbortError" && error?.status !== 404) {
          console.error("LRCLIB fetch failed", error);
        }
      })
      .finally(() => {
        if (this.abortController === controller) {
          this.fetching = false;
          this.lookupComplete = true;
          this.abortController = null;
          this.render();
        }
      });
  }

  async saveFetchedLyrics(song) {
    if (!this.fetched || this.saving) return;
    this.saving = true;
    this.render();
    try {
      const plainLyrics = this.fetched.plainLyrics || "";
      const syncedLyrics = this.fetched.syncedLyrics || "";
      await API.saveLyrics(song.trackId, plainLyrics, syncedLyrics);
      this.fetched = null;
      updateSongLyrics(song.trackId, plainLyrics, syncedLyrics);
      toast("Lyrics saved to library", "success");
    } catch (error) {
      console.error("Failed to save lyrics", error);
      toast("Failed to save lyrics", "error");
    } finally {
      this.saving = false;
      this.render();
    }
  }

  updateActiveLine({ scroll = true } = {}) {
    if (!this.synced?.length || !this.lineElements.length) return;
    const active = findActiveIndex(this.synced, getPlayerState().currentTime * 1000);
    if (active === this.activeIndex) return;
    this.lineElements[this.activeIndex]?.classList.remove("active");
    this.lineElements[active]?.classList.add("active");
    this.activeIndex = active;
    if (scroll) this.lineElements[active]?.scrollIntoView({ block: "center", behavior: "auto" });
  }
}

function shouldOfferFetchedLyricsSave(song, fetched) {
  const fetchedPlain = fetched?.plainLyrics?.trim() || "";
  const fetchedSynced = fetched?.syncedLyrics?.trim() || "";
  if (!fetchedPlain && !fetchedSynced) return false;
  return fetchedPlain !== (song.lyrics?.trim() || "") || fetchedSynced !== (song.syncedLyrics?.trim() || "");
}

function songSignature(song, fetched) {
  return [
    song.trackId,
    song.name,
    song.artistName,
    song.albumArt,
    song.lyrics,
    song.syncedLyrics,
    fetched?.plainLyrics,
    fetched?.syncedLyrics,
  ].join("\u0000");
}

customElements.define("lyrics-view", LyricsView);
