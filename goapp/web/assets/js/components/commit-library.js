import { API } from "../api.js";
import { clearWorkflowState, el, loadWorkflowState, showDialog } from "../store.js";

export class CommitLibraryPage extends HTMLElement {
  connectedCallback() {
    this.state = loadWorkflowState();
    if (!this.state) {
      window.Orpheus.router.go("/discover");
      return;
    }
    this.results = null;
    this.render();
  }

  render() {
    const items = this.commitItems();
    const list = el("div", { class: "stack" });
    for (const item of items) {
      list.append(el("article", { class: "card compact-card" }, [
        el("h2", { text: item.edits.trackName || item.song.name }),
        el("p", { class: "muted", text: `${item.edits.artistName || item.song.artist} · ${item.video.title}` }),
      ]));
    }
    const resultList = el("div", { class: "stack" });
    if (this.results) {
      for (const result of this.results) {
        resultList.append(el("p", { class: result.success ? "success" : "error", text: `${result.trackId}: ${result.success ? "saved" : result.error}` }));
      }
    }
    this.replaceChildren(el("section", { class: "page" }, [
      el("workflow-progress", { stage: "commit" }),
      el("div", { class: "page-header" }, [el("h1", { text: "Commit to Library" }), el("p", { class: "muted", text: `${items.length} tracks ready to save.` })]),
      list,
      resultList,
      el("div", { class: "actions sticky-actions" }, [
        el("button", { class: "button secondary", type: "button", text: "Back", onclick: () => window.Orpheus.router.go("/discover/review") }),
        el("button", { class: "button", type: "button", text: this.saving ? "Saving..." : this.hasFailures() ? "Try Again" : "Save", disabled: this.saving || !items.length, onclick: () => this.commit() }),
        this.results?.every((result) => result.success) ? el("button", { class: "button", type: "button", text: "Go to Tracks", onclick: () => window.Orpheus.router.go("/home") }) : null,
      ]),
    ]));
  }

  commitItems() {
    const matches = this.state.trackMatches.filter((result) => result.selectedMatch);
    return matches.map((result, index) => {
      const song = result.selectedMatch;
      const lyricsSearchResult = this.state.lyricsSearchResults.find((candidate) => candidate.trackId === song.id);
      const edits = this.state.editedTracks[index] || {};
      return { song, video: result.youtubeVideo, lyricsSearchResult, edits };
    });
  }

  hasFailures() {
    return this.results?.some((result) => !result.success) || false;
  }

  async commit() {
    this.saving = true;
    this.render();
    try {
      const response = await API.commit(this.commitItems());
      this.results = response.results || [];
      if (this.results.every((result) => result.success)) {
        clearWorkflowState();
        window.dispatchEvent(new CustomEvent("song-library-invalidated"));
      } else if (this.hasFailures()) {
        showDialog("Something went wrong while saving one or more tracks. Please try again.");
      }
    } catch (error) {
      showDialog(error.message || "Something went wrong while saving. Please try again.");
    } finally {
      this.saving = false;
      this.render();
    }
  }
}

customElements.define("commit-library-page", CommitLibraryPage);
