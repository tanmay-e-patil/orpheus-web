import { el, loadWorkflowState, saveWorkflowState, showDialog, updateWorkflowStage } from "../store.js";

export class ReviewEditPage extends HTMLElement {
  connectedCallback() {
    this.state = loadWorkflowState();
    if (!this.state) {
      window.Orpheus.router.go("/discover");
      return;
    }
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
    const stack = el("div", { class: "stack" });
    this.inputs = [];
    this.items.forEach((item, index) => stack.append(this.editCard(item, index)));
    this.replaceChildren(el("section", { class: "page" }, [
      el("workflow-progress", { stage: "review" }),
      el("div", { class: "page-header" }, [el("h1", { text: "Review & Edit" }), el("p", { class: "muted", text: "Validate metadata before saving to the library." })]),
      stack,
      el("div", { class: "actions sticky-actions" }, [
        el("button", { class: "button secondary", type: "button", text: "Back", onclick: () => { this.save(); updateWorkflowStage(loadWorkflowState(), "lyrics"); window.Orpheus.router.go("/discover/lyrics"); } }),
        el("button", { class: "button", type: "button", text: "Continue", onclick: () => this.continue() }),
      ]),
    ]));
  }

  editCard(item, index) {
    const fields = [
      ["trackName", "Track name"],
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
    const lyrics = el("textarea", { class: "textarea", placeholder: "Plain lyrics" });
    lyrics.value = item.lyrics || "";
    const synced = el("textarea", { class: "textarea", placeholder: "Synced lyrics (LRC)" });
    synced.value = item.syncedLyrics || "";
    this.inputs.push({ index, key: "lyrics", input: lyrics }, { index, key: "syncedLyrics", input: synced });
    return el("article", { class: "card edit-card" }, [
      el("h2", { text: item.youtubeTitle || item.trackName }),
      el("p", { class: "muted", text: item.youtubeChannel || "" }),
      ...controls,
      lyrics,
      synced,
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
      if (!item.trackName.trim()) errors.push(`Track ${index + 1}: track name required`);
      if (!item.artistName.trim()) errors.push(`Track ${index + 1}: artist required`);
      if (!item.albumName.trim()) errors.push(`Track ${index + 1}: album required`);
      if (item.releaseDate && !/^\d{4}-\d{2}-\d{2}$/.test(item.releaseDate)) errors.push(`Track ${index + 1}: release date must be YYYY-MM-DD`);
    });
    return errors;
  }

  save() {
    const state = loadWorkflowState();
    state.editedTracks = this.collect();
    saveWorkflowState(state);
  }

  continue() {
    const items = this.collect();
    const errors = this.validate(items);
    if (errors.length) {
      showDialog(errors.join("\n"));
      return;
    }
    const state = loadWorkflowState();
    state.editedTracks = items;
    saveWorkflowState(state);
    updateWorkflowStage(state, "commit");
    window.Orpheus.router.go("/discover/commit");
  }
}

customElements.define("review-edit-page", ReviewEditPage);
