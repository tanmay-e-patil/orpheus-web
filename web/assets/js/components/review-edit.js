import { clearSongsCache } from "../idb-song-cache.js";
import { API } from "../api.js";
import { buildCommitItems, mergeCommitResults } from "../workflow-save.js";
import { appState, clearWorkflowState, el, loadWorkflowState, saveWorkflowState, showDialog, updateWorkflowStage } from "../store.js";

export class ReviewEditPage extends HTMLElement {
  connectedCallback() {
    this.state = loadWorkflowState();
    if (!this.state) {
      window.Orpheus.router.go("/discover");
      return;
    }
    this.results = this.state.saveResults || [];
    this.items = this.buildItems();
    this.render();
  }

  buildItems() {
    if (this.state.editedTracks?.length) return this.state.editedTracks;
    return this.state.trackMatches.filter((result) => result.selectedMatch).map((result) => {
      const lyrics = this.state.lyricsSearchResults.find((candidate) => candidate.trackId === result.selectedMatch.id)?.selectedOption;
      return {
        youtubeTitle: result.youtubeVideo.title,
        youtubeChannel: result.youtubeVideo.channelTitle,
        youtubeDuration: result.youtubeVideo.duration || "",
        trackName: result.selectedMatch.name,
        artistName: result.selectedMatch.artist,
        albumName: result.selectedMatch.album,
        albumArt: result.selectedMatch.albumImageUrl,
        releaseDate: result.selectedMatch.releaseDate,
        trackDuration: result.youtubeVideo.duration || "",
        lyrics: lyrics?.plainLyrics || "",
        syncedLyrics: lyrics?.syncedLyrics || "",
      };
    });
  }

  render() {
    const allSaved = this.allSaved();
    const stack = el("div", { class: "stack" });
    this.inputs = [];
    this.items.forEach((item, index) => stack.append(this.editCard(item, index)));
    this.replaceChildren(el("section", { class: "page" }, [
      el("workflow-progress", { stage: "review", locked: this.saving || this.results.length > 0 }),
      el("div", { class: "page-header" }, [el("h1", { text: "Review" }), el("p", { class: "muted", text: "Check song info before saving to the library." })]),
      stack,
      el("div", { class: "save-results stack", role: "status", "aria-live": "polite", tabindex: "-1" }, [
        this.saveError ? el("p", { class: "error", text: this.saveError }) : null,
        ...this.results.map((result) => {
          const index = this.state.trackMatches.filter((match) => match.selectedMatch).findIndex((match) => match.selectedMatch.id === result.trackId);
          return el("p", { class: result.success ? "success" : "error", text: `${this.items[index]?.trackName || result.trackId}: ${result.success ? "Saved to library. Audio may still be processing." : result.error || "Could not save. Try again."}` });
        }),
      ]),
      el("div", { class: "actions sticky-actions" }, [
        el("button", { class: "button secondary", type: "button", text: "Back", disabled: this.saving || this.results.length > 0, onclick: () => { this.save(); updateWorkflowStage(loadWorkflowState(), "lyrics"); window.Orpheus.router.go("/discover/lyrics"); } }),
        allSaved
          ? el("a", { class: "button", href: "/home", "data-link": "", text: "Go to Tracks" })
          : el("button", { class: "button", type: "button", text: this.saving ? "Saving..." : this.results.length ? "Retry unsaved songs" : "Save to library", disabled: this.saving || !this.items.length, onclick: () => this.commit() }),
      ]),
    ]));
  }

  editCard(item, index) {
    const fields = [
      ["trackName", "Song name"],
      ["artistName", "Artist"],
      ["albumName", "Album"],
      ["albumArt", "Album art URL"],
      ["releaseDate", "Release date"],
      ["trackDuration", "Duration"],
    ];
    const controls = fields.map(([key, label]) => {
      const input = el("input", { class: "input", value: item[key] || "", placeholder: label });
      this.inputs.push({ index, key, input });
      return el("label", {}, [el("span", { text: label }), input]);
    });
    const lyrics = el("textarea", { class: "textarea", placeholder: "Lyrics" });
    lyrics.value = item.lyrics || "";
    const synced = el("textarea", { class: "textarea", placeholder: "Synced lyrics" });
    synced.value = item.syncedLyrics || "";
    this.inputs.push({ index, key: "lyrics", input: lyrics }, { index, key: "syncedLyrics", input: synced });
    const match = this.state.trackMatches.filter((result) => result.selectedMatch)[index];
    const saved = this.results.some((result) => result.trackId === match?.selectedMatch.id && result.success);
    return el("fieldset", { class: "card edit-card", disabled: this.saving || saved }, [
      el("h2", { text: item.youtubeTitle || item.trackName }),
      el("p", { class: "muted", text: item.youtubeChannel || "" }),
      ...controls,
      el("label", {}, [el("span", { text: "Lyrics" }), lyrics]),
      el("label", {}, [el("span", { text: "Synced lyrics" }), synced]),
    ]);
  }

  collect() {
    const next = this.items.map((item) => ({ ...item }));
    for (const entry of this.inputs) {
      next[entry.index][entry.key] = entry.input.value;
    }
    return next;
  }

  validate(items) {
    const errors = [];
    items.forEach((item, index) => {
      if (!item.trackName.trim()) errors.push(`Song ${index + 1}: song name required`);
      if (!item.artistName.trim()) errors.push(`Song ${index + 1}: artist required`);
      if (!item.albumName.trim()) errors.push(`Song ${index + 1}: album required`);
      if (item.releaseDate && !/^\d{4}-\d{2}-\d{2}$/.test(item.releaseDate)) errors.push(`Song ${index + 1}: release date must be YYYY-MM-DD`);
    });
    return errors;
  }

  save() {
    this.state.editedTracks = this.collect();
    saveWorkflowState(this.state);
  }

  allSaved() {
    return this.items.length > 0 && buildCommitItems(this.state, this.results).length === 0;
  }

  async commit() {
    if (this.saving || this.allSaved()) return;
    const items = this.collect();
    const errors = this.validate(items);
    if (errors.length) {
      showDialog(errors.join("\n"));
      return;
    }
    this.items = items;
    this.state.editedTracks = items;
    this.state.currentStage = "review";
    saveWorkflowState(this.state);
    const submitted = buildCommitItems(this.state, this.results);
    this.saving = true;
    this.saveError = "";
    this.render();
    try {
      const response = await API.commit(submitted);
      this.results = mergeCommitResults(this.results, submitted, response.results || []);
      this.state.saveResults = this.results;
      // Do not overwrite a different session started while this request was running.
      if (loadWorkflowState()?.id === this.state.id) {
        if (this.allSaved()) clearWorkflowState();
        else saveWorkflowState(this.state);
      }
      if (this.results.some((result) => result.success)) {
        await clearSongsCache(appState.session?.user?.id || "single-user").catch(() => {});
        window.dispatchEvent(new CustomEvent("song-library-invalidated"));
      }
    } catch (error) {
      this.saveError = error.message || "Could not save songs. Please try again.";
    } finally {
      this.saving = false;
      if (this.isConnected) {
        this.render();
        this.querySelector(".save-results")?.focus({ preventScroll: true });
      }
    }
  }
}

customElements.define("review-edit-page", ReviewEditPage);
