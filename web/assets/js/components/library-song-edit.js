import { API } from "../api.js";
import { clearSongsCache } from "../idb-song-cache.js";
import { setQueue, updateQueueSong, updateSongLyrics } from "../player-store.js";
import { appState, el, showDialog, toast } from "../store.js";

export class LibrarySongEditPage extends HTMLElement {
  connectedCallback() {
    this.trackId = decodeURIComponent(window.location.pathname.match(/^\/songs\/([^/]+)\/edit$/)?.[1] || "");
    this.offsetSeconds = 0;
    this.renderLoading();
    this.load();
  }

  disconnectedCallback() {
    clearInterval(this.pollTimer);
  }

  async load() {
    try {
      const data = await API.song(this.trackId);
      this.song = data.song;
      this.audioSource = data.audioSource;
      this.render();
      this.updatePolling();
    } catch (error) {
      this.replaceChildren(el("section", { class: "page-card" }, [el("h1", { text: "Song not found" }), el("p", { class: "muted", text: error.message })]));
    }
  }

  renderLoading() {
    this.replaceChildren(el("section", { class: "page-card" }, [el("h1", { text: "Edit song" }), el("p", { class: "muted", text: "Loading…" })]));
  }

  render() {
    const song = this.song;
    this.replaceChildren(el("div", { class: "edit-song-page" }, [
      el("header", { class: "page-header" }, [
        el("div", {}, [el("p", { class: "eyebrow", text: "Library song" }), el("h1", { text: song.name }), el("p", { class: "muted", text: `${song.artistName} · ${song.albumName}` })]),
        el("div", { class: "actions" }, [
          el("a", { class: "button secondary", href: "/home", "data-link": "", text: "Back to library" }),
          song.isAvailable ? el("button", { class: "button", type: "button", text: "Play song", onclick: () => setQueue([song], 0) }) : null,
        ]),
      ]),
      this.regenerationBanner(),
      this.metadataSection(),
      this.audioSourceSection(),
      this.lyricsSection(),
      this.regenerateSection(),
    ]));
  }

  regenerationBanner() {
    if (this.song.isAvailable) return el("p", { class: "status-pill success", text: this.waitedForReady ? "Audio ready." : "Available" });
    return el("p", { class: "status-pill warning", text: "Audio unavailable. Regeneration may be pending." });
  }

  metadataSection() {
    const results = el("div", { class: "result-list" });
    const fields = {
      name: field("Name", "name", this.song.name, true),
      artistName: field("Artist", "artistName", this.song.artistName, true),
      albumName: field("Album", "albumName", this.song.albumName, true),
      albumArt: field("Album art URL", "albumArt", this.song.albumArt),
      releaseDate: field("Release date", "releaseDate", "", false, "YYYY or YYYY-MM-DD; empty preserves current value"),
    };
    const find = el("button", { class: "button secondary", type: "button", text: "Find Deezer candidates" });
    find.addEventListener("click", async () => {
      find.disabled = true;
      try {
        const query = `${fields.name.input.value} ${fields.artistName.input.value} ${fields.albumName.input.value}`.trim();
        const result = await API.customDeezerMatch({ ...syntheticVideo(this.song), title: query }, query);
        const matches = result.trackMatches || [];
        results.replaceChildren(...(matches.length ? matches.map((track) => this.deezerCandidate(track, fields)) : [el("p", { class: "muted", text: "No Deezer candidates found." })]));
      } catch (error) { showDialog(error.message); }
      finally { find.disabled = false; }
    });
    const form = el("form", { class: "page-card form-grid" }, [
      el("h2", { text: "Song Metadata" }),
      fields.name.label,
      fields.artistName.label,
      fields.albumName.label,
      readonlyField("Duration", formatDuration(this.song.duration) || "Unknown"),
      fields.albumArt.label,
      fields.releaseDate.label,
      el("div", { class: "actions" }, [find, el("button", { class: "button", type: "submit", text: "Save metadata" })]),
      results,
    ]);
    form.addEventListener("submit", (event) => this.saveMetadata(event, form));
    return form;
  }

  deezerCandidate(track, fields) {
    const apply = el("button", { class: "button secondary", type: "button", text: "Use metadata" });
    apply.addEventListener("click", () => {
      fields.name.input.value = track.name || "";
      fields.artistName.input.value = track.artist || "";
      fields.albumName.input.value = track.album || "";
      fields.albumArt.input.value = track.albumImageUrl || "";
      fields.releaseDate.input.value = track.releaseDate || "";
      toast("Deezer metadata applied; save to update the song", "success");
    });
    return el("article", { class: "result-card" }, [
      track.albumImageUrl ? el("img", { src: track.albumImageUrl, alt: "", loading: "lazy" }) : null,
      el("div", {}, [
        el("strong", { text: track.name || "Unknown track" }),
        el("p", { class: "muted", text: [track.artist, track.album, track.releaseDate].filter(Boolean).join(" · ") }),
        track.matchScore ? el("p", { class: "muted", text: `Match score ${track.matchScore}` }) : null,
      ]),
      el("div", { class: "actions" }, [apply]),
    ]);
  }

  async saveMetadata(event, form) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    if (data.albumArt !== this.song.albumArt && !confirm("Changing album art will make this song unavailable and queue audio regeneration. Continue?")) return;
    await this.mutate(() => API.updateSongMetadata(this.trackId, data), "Metadata saved");
  }

  audioSourceSection() {
    const source = this.audioSource;
    const query = el("input", { name: "query", value: `${this.song.name} ${this.song.artistName}` });
    const results = el("div", { class: "result-list" });
    const search = el("button", { class: "button secondary", type: "button", text: "Search YouTube" });
    search.addEventListener("click", async () => {
      search.disabled = true;
      try {
        this.youtubeResults = await API.discoverYouTube(query.value);
        results.replaceChildren(...this.youtubeResults.map((video) => this.videoResult(video)));
      } catch (error) { showDialog(error.message); }
      finally { search.disabled = false; }
    });
    return el("section", { class: "page-card" }, [
      el("h2", { text: "Audio Source" }),
      source ? el("p", { class: "muted", text: `Current: ${source.title} — ${source.channelTitle}` }) : el("p", { class: "muted", text: "No current audio source." }),
      el("div", { class: "inline-form" }, [query, search]),
      results,
    ]);
  }

  videoResult(video) {
    const current = video.id === this.song.youtubeVideoId;
    const warn = durationWarning(this.song.duration, video.duration);
    const preview = el("div", { class: "audio-source-preview", hidden: true });
    const previewButton = el("button", { class: "button secondary", type: "button", text: "Preview" });
    previewButton.addEventListener("click", () => {
      const open = preview.hasAttribute("hidden");
      previewButton.textContent = open ? "Close preview" : "Preview";
      if (open && !preview.childElementCount) {
        preview.replaceChildren(el("iframe", {
          src: `https://www.youtube.com/embed/${encodeURIComponent(video.id)}?autoplay=1&rel=0&modestbranding=1`,
          title: `Preview ${video.title}`,
          allow: "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share",
          allowfullscreen: true,
        }));
      }
      preview.toggleAttribute("hidden", !open);
    });
    const button = el("button", { class: "button secondary", type: "button", text: current ? "Current" : "Use this source" });
    button.disabled = current;
    button.addEventListener("click", async () => {
      if (warn && !confirm(`${warn} Replace audio source anyway?`)) return;
      await this.mutate(() => API.replaceAudioSource(this.trackId, video), "Audio source replaced; regeneration requested");
    });
    return el("article", { class: "result-card" }, [
      video.thumbnail ? el("img", { src: video.thumbnail, alt: "" }) : null,
      el("div", {}, [el("strong", { text: video.title }), el("p", { class: "muted", text: `${video.channelTitle || "Unknown channel"} ${formatDuration(video.duration) || video.duration || ""}` }), warn ? el("p", { class: "warning-text", text: warn }) : null]),
      el("div", { class: "actions" }, [previewButton, button]),
      preview,
    ]);
  }

  lyricsSection() {
    const options = el("div", { class: "result-list" });
    const custom = el("input", { placeholder: "Custom LRCLIB search" });
    const loadOptions = async (customQuery = "") => {
      try {
        const track = syntheticTrack(this.song);
        const result = customQuery ? await API.customLyricsSearch(track, customQuery) : await API.lyricsOptions(track);
        options.replaceChildren(...(result.options || []).map((option) => this.lyricsOption(option)));
      } catch (error) { showDialog(error.message); }
    };
    const plain = el("textarea", { name: "plain", rows: "8" }, [this.song.lyrics || ""]);
    const synced = el("textarea", { name: "synced", rows: "8" }, [this.song.syncedLyrics || ""]);
    const offset = el("input", { type: "number", step: "0.01", value: "0", "aria-label": "Offset seconds" });
    const preview = el("pre", { class: "lyrics-preview", text: this.song.syncedLyrics || "No synced lyrics." });
    const adjustedSyncTest = this.syncTestControl(() => adjustLrc(this.song.syncedLyrics || "", Number(offset.value || 0)), "Test adjusted sync");
    const rawSyncTest = this.syncTestControl(() => synced.value, "Test raw sync");
    const updatePreview = () => { this.offsetSeconds = Number(offset.value || 0); preview.textContent = adjustLrc(this.song.syncedLyrics || "", this.offsetSeconds) || "No synced lyrics."; };
    offset.addEventListener("input", updatePreview);
    return el("section", { class: "page-card" }, [
      el("h2", { text: "Lyrics" }),
      el("p", { class: "muted", text: this.song.lyrics || this.song.syncedLyrics ? "Stored lyrics are shown below." : "No stored lyrics." }),
      this.song.syncedLyrics ? el("div", { class: "inline-form" }, [adjustedSyncTest.button]) : null,
      el("div", { class: "inline-form" }, [el("button", { class: "button secondary", type: "button", text: "Find LRCLIB options", onclick: () => loadOptions() }), custom, el("button", { class: "button secondary", type: "button", text: "Custom search", onclick: () => loadOptions(custom.value) })]),
      options,
      el("h3", { text: "Timing adjustment" }),
      this.song.syncedLyrics ? el("div", { class: "inline-form" }, ["-1", "-0.5", "0.5", "1"].map((value) => el("button", { class: "button secondary", type: "button", text: `${Number(value) > 0 ? "+" : ""}${value}s`, onclick: () => { offset.value = String(Number(offset.value || 0) + Number(value)); updatePreview(); } })).concat([offset, el("button", { class: "button", type: "button", text: "Save adjusted timing", onclick: () => this.saveLyrics(this.song.lyrics || "", adjustLrc(this.song.syncedLyrics || "", Number(offset.value || 0))) })])) : el("p", { class: "muted", text: "No synced lyrics to adjust. Select LRCLIB synced lyrics or use Advanced edit." }),
      adjustedSyncTest.mount,
      preview,
      el("details", {}, [el("summary", { text: "Advanced edit" }), el("label", {}, ["Plain lyrics", plain]), el("label", {}, ["Synced lyrics", synced]), el("div", { class: "inline-form" }, [rawSyncTest.button, el("button", { class: "button", type: "button", text: "Save raw lyrics", onclick: () => this.saveLyrics(plain.value, synced.value) })]), rawSyncTest.mount]),
    ]);
  }

  syncTestControl(getLyrics, label = "Test sync") {
    const mount = el("div", { class: "sync-test-shell" });
    const button = el("button", { class: "button secondary", type: "button", text: label });
    button.addEventListener("click", () => {
      const lyrics = getLyrics();
      const videoId = this.song.youtubeVideoId || this.audioSource?.id;
      if (!videoId) return showDialog("No YouTube video is linked for this track.");
      if (!lyrics?.trim()) return showDialog("No synced lyrics to test.");
      mount.replaceChildren(el("lyrics-sync-test", {
        "data-video-id": videoId,
        "data-lyrics": lyrics,
        "data-key": `${this.trackId}-${Date.now()}`,
      }));
    });
    return { button, mount };
  }

  lyricsOption(option) {
    const save = el("button", { class: "button secondary", type: "button", text: "Save lyrics" });
    const syncTest = this.syncTestControl(() => option.syncedLyrics || "", "Test sync");
    save.addEventListener("click", () => this.saveLyrics(option.plainLyrics || "", option.syncedLyrics || ""));
    return el("article", { class: "result-card" }, [
      el("div", {}, [
        el("strong", { text: `${option.trackName} — ${option.artistName}` }),
        el("p", { class: "muted", text: option.hasSync ? "Synced lyrics" : "Plain lyrics only" }),
        el("div", { class: "actions" }, [option.syncedLyrics ? syncTest.button : null, save]),
        syncTest.mount,
        el("pre", { class: "lyrics-preview compact", text: option.syncedLyrics || option.plainLyrics || "No lyrics text" }),
      ]),
    ]);
  }

  async saveLyrics(plain, synced) {
    await API.saveLyrics(this.trackId, plain, synced);
    await clearSongsCache(appState.session?.user?.id || "current");
    updateSongLyrics(this.trackId, plain, synced);
    toast("Lyrics saved", "success");
    await this.load();
  }

  regenerateSection() {
    const button = el("button", { class: "button danger", type: "button", text: "Regenerate audio" });
    button.addEventListener("click", async () => {
      if (!confirm("Regenerate audio from the current source? The song will be unavailable until processing finishes.")) return;
      await this.mutate(() => API.regenerateSong(this.trackId), "Regeneration requested");
    });
    return el("section", { class: "page-card" }, [el("h2", { text: "Manual Regenerate" }), el("p", { class: "muted", text: "Queues a rebuild from the current Audio Source." }), button]);
  }

  async mutate(action, message) {
    try {
      const response = await action();
      this.song = response.song;
      this.audioSource = response.audioSource;
      updateQueueSong(this.trackId, response.song);
      await clearSongsCache(appState.session?.user?.id || "current");
      toast(message, "success");
      this.render();
      this.updatePolling();
    } catch (error) { showDialog(error.message); }
  }

  updatePolling() {
    clearInterval(this.pollTimer);
    if (this.song?.isAvailable === false) {
      this.pollTimer = setInterval(async () => {
        const data = await API.song(this.trackId).catch(() => null);
        if (data?.song?.isAvailable) {
          this.waitedForReady = true;
          this.song = data.song;
          this.audioSource = data.audioSource;
          updateQueueSong(this.trackId, data.song);
          clearInterval(this.pollTimer);
          this.render();
        }
      }, 4000);
    }
  }
}

function field(label, name, value, required = false, help = "") {
  const input = el("input", { name, value, required });
  return { input, label: el("label", {}, [label, input, help ? el("small", { class: "muted", text: help }) : null]) };
}

function syntheticVideo(song) {
  return {
    id: song.youtubeVideoId || song.trackId,
    title: `${song.name} ${song.artistName}`,
    thumbnail: song.albumArt || "",
    channelTitle: song.artistName || "",
    duration: song.duration || null,
  };
}

function readonlyField(label, value) {
  return el("label", {}, [label, el("input", { value, readonly: true, "aria-readonly": "true" })]);
}

function syntheticTrack(song) {
  return { id: song.trackId, name: song.name, artist: song.artistName, album: song.albumName, albumImageUrl: song.albumArt, releaseDate: "" };
}

function parseISODurationSeconds(duration) {
  const match = String(duration || "").match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  return match ? Number(match[1] || 0) * 3600 + Number(match[2] || 0) * 60 + Number(match[3] || 0) : 0;
}

function formatDuration(duration) {
  if (!duration) return "";
  const seconds = parseISODurationSeconds(duration);
  if (!seconds) return duration;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remaining = seconds % 60;
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}` : `${minutes}:${String(remaining).padStart(2, "0")}`;
}

function durationWarning(currentDuration, candidateDuration) {
  const current = parseISODurationSeconds(currentDuration);
  const candidate = parseISODurationSeconds(candidateDuration);
  if (!current || !candidate) return "";
  const diff = Math.abs(current - candidate);
  return diff > 30 || diff / current > 0.2 ? `Duration differs by ${Math.round(diff)} seconds.` : "";
}

function adjustLrc(text, offsetSeconds) {
  return String(text || "").split(/\r?\n/).map((line) => line.replace(/\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g, (_, mm, ss, frac = "0") => {
    const centis = Math.round((Number(mm) * 60 + Number(ss)) * 100 + Number((frac + "00").slice(0, 2)) + offsetSeconds * 100);
    const clamped = Math.max(0, centis);
    const minutes = Math.floor(clamped / 6000);
    const seconds = Math.floor((clamped % 6000) / 100);
    const cs = clamped % 100;
    return `[${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(cs).padStart(2, "0")}]`;
  })).join("\n");
}

customElements.define("library-song-edit-page", LibrarySongEditPage);
