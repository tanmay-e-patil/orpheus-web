import { API } from "../api.js";
import { el, loadWorkflowState, saveWorkflowState, showDialog, updateWorkflowStage } from "../store.js";

export class LyricsEnrichmentPage extends HTMLElement {
  connectedCallback() {
    this.state = loadWorkflowState();
    if (!this.state) {
      window.Orpheus.router.go("/discover");
      return;
    }
    this.tracks = this.state.trackMatches.filter((result) => result.selectedMatch).map((result) => result.selectedMatch);
    this.results = this.state.lyricsSearchResults || [];
    this.render();
    if (!this.matchesCurrentTracks()) this.fetchAll();
  }

  matchesCurrentTracks() {
    const tracks = new Set(this.tracks.map((track) => track.id));
    const results = new Set(this.results.map((result) => result.trackId));
    return tracks.size === results.size && [...tracks].every((id) => results.has(id));
  }

  async fetchAll() {
    this.loading = true;
    this.render();
    try {
      this.results = [];
      for (const track of this.tracks) {
        this.results.push(await API.lyricsOptions(track));
        this.persist();
        this.render();
      }
    } catch (error) {
      showDialog(error.message || "Lyrics lookup failed");
    } finally {
      this.loading = false;
      this.render();
    }
  }

  render() {
    const stack = el("div", { class: "stack" });
    for (const [index, result] of this.results.entries()) stack.append(this.resultCard(result, index));
    this.replaceChildren(el("section", { class: "page" }, [
      el("workflow-progress", { stage: "lyrics" }),
      el("div", { class: "page-header" }, [el("h1", { text: "Lyrics Enrichment" }), el("p", { class: "muted", text: this.loading ? "Searching LRCLIB..." : "Choose lyrics for each matched track." })]),
      stack,
      el("div", { class: "actions sticky-actions" }, [
        el("button", { class: "button secondary", type: "button", text: "Back", onclick: () => { updateWorkflowStage(loadWorkflowState(), "spotify"); window.Orpheus.router.go("/discover/spotify"); } }),
        el("button", { class: "button", type: "button", text: "Continue", disabled: this.loading, onclick: () => this.continue() }),
      ]),
    ]));
  }

  resultCard(result, resultIndex) {
    const options = el("div", { class: "match-list" });
    for (const [optionIndex, option] of result.options.entries()) {
      options.append(el("button", { class: `match-row ${result.selectedOption?.id === option.id ? "selected" : ""}`, type: "button", onclick: () => this.select(resultIndex, optionIndex) }, [
        el("span", {}, [el("strong", { text: `${option.trackName} - ${option.artistName}` }), el("span", { class: "muted", text: `${option.confidence}% · ${option.hasSync ? "synced" : "plain"}` })]),
      ]));
    }
    const selected = result.selectedOption;
    const input = el("input", { class: "input", placeholder: "Custom lyrics query" });
    return el("article", { class: "card" }, [
      el("h2", { text: result.query.track }),
      el("p", { class: "badge", text: result.status }),
      options,
      selected ? el("pre", { class: "lyrics-preview", text: selected.syncedLyrics || selected.plainLyrics || "" }) : null,
      el("div", { class: "input-row" }, [
        input,
        el("button", { class: "button secondary", type: "button", text: "Search", onclick: () => this.customSearch(resultIndex, input.value) }),
        el("button", { class: "button secondary", type: "button", text: "Skip", onclick: () => this.skip(resultIndex) }),
      ]),
    ]);
  }

  select(resultIndex, optionIndex) {
    this.results[resultIndex].selectedOption = this.results[resultIndex].options[optionIndex];
    this.persist();
    this.render();
  }

  skip(resultIndex) {
    delete this.results[resultIndex].selectedOption;
    this.persist();
    this.render();
  }

  async customSearch(resultIndex, query) {
    if (!query.trim()) return;
    const track = this.tracks.find((candidate) => candidate.id === this.results[resultIndex].trackId);
    try {
      this.results[resultIndex] = await API.customLyricsSearch(track, query.trim());
      this.persist();
      this.render();
    } catch (error) {
      showDialog(error.message || "Custom lyrics search failed");
    }
  }

  persist() {
    const state = loadWorkflowState();
    state.lyricsSearchResults = this.results;
    state.currentStage = "lyrics";
    saveWorkflowState(state);
  }

  continue() {
    const state = loadWorkflowState();
    state.lyricsSearchResults = this.results;
    updateWorkflowStage(state, "review");
    window.Orpheus.router.go("/discover/review");
  }
}

customElements.define("lyrics-enrichment-page", LyricsEnrichmentPage);
