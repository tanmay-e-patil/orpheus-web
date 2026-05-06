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
    this.onChange = () => this.render();
    playerStore.addEventListener("change", this.onChange);
    this.render();
  }

  disconnectedCallback() {
    if (this.onChange) playerStore.removeEventListener("change", this.onChange);
    this.abortController?.abort();
  }

  render() {
    const song = currentSong();
    this.closest(".lyrics-panel-shell")?.toggleAttribute("hidden", !song);
    if (!song) {
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
    }
    this.fetchMissingLyrics(song);

    const fetchedSynced = this.fetched?.syncedLyrics?.trim() ? this.fetched.syncedLyrics : "";
    const synced = parseLRC(fetchedSynced || song.syncedLyrics || "");
    const header = this.renderHeader(song);
    if (synced.length) {
      const active = findActiveIndex(synced, getPlayerState().currentTime * 1000);
      const list = el("div", { class: "lyrics-lines" });
      synced.forEach((line, index) => {
        list.append(el("p", { class: index === active ? "active" : "", text: line.text }));
      });
      const children = [header];
      if (fetchedSynced && !song.syncedLyrics?.trim()) {
        children.push(this.renderSavePrompt(song, "Preview from LRCLIB"));
      }
      children.push(list);
      this.replaceChildren(el("div", { class: "lyrics-view" }, children));
      list.querySelector(".active")?.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }

    const plainLyrics = song.lyrics || this.fetched?.plainLyrics || "";
    if (plainLyrics || this.fetching) {
      const body = this.fetching && !plainLyrics ? "Looking up lyrics from LRCLIB..." : plainLyrics;
      const children = [header, el("pre", { text: body })];
      if (this.fetched?.plainLyrics || this.fetched?.syncedLyrics) {
        children.push(this.renderSavePrompt(song, "Found lyrics from LRCLIB"));
      }
      this.replaceChildren(el("div", { class: "lyrics-view" }, [
        ...children,
      ]));
      return;
    }
    this.replaceChildren(el("div", { class: "lyrics-view" }, [
      header,
      el("div", { class: "lyrics-empty", text: "No lyrics available." }),
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
}

customElements.define("lyrics-view", LyricsView);
