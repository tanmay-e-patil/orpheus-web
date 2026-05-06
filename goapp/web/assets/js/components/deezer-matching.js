import { API } from "../api.js";
import { el, loadWorkflowState, saveWorkflowState, showDialog, updateWorkflowStage } from "../store.js";

export class DeezerMatchingPage extends HTMLElement {
  connectedCallback() {
    const state = loadWorkflowState();
    if (!state) {
      window.Orpheus.router.go("/discover");
      return;
    }
    this.state = state;
    this.selectedVideos = state.selectedVideos.filter((video) => video.selected);
    this.results = state.trackMatches || [];
    this.render();
    if (!this.matchesCurrentSelection()) this.findMatches();
  }

  matchesCurrentSelection() {
    const selected = new Set(this.selectedVideos.map((video) => video.id));
    const matched = new Set(this.results.map((result) => result.youtubeVideo.id));
    return selected.size === matched.size && [...selected].every((id) => matched.has(id));
  }

  async findMatches() {
    this.loading = true;
    this.render();
    try {
      this.results = await API.matchDeezerTracks(this.selectedVideos);
      this.persist();
    } catch (error) {
      showDialog(error.message || "Deezer matching failed");
    } finally {
      this.loading = false;
      this.render();
    }
  }

  render() {
    if (!this.selectedVideos.length) {
      this.replaceChildren(el("section", { class: "page" }, [
        el("h1", { text: "No Videos Selected" }),
        el("button", { class: "button", type: "button", text: "Back to YouTube", onclick: () => window.Orpheus.router.go("/discover/youtube") }),
      ]));
      return;
    }
    const stack = el("div", { class: "stack" });
    for (const [index, result] of this.results.entries()) stack.append(this.resultCard(result, index));
    this.replaceChildren(el("section", { class: "page" }, [
      el("workflow-progress", { stage: "spotify" }),
      el("div", { class: "page-header" }, [el("h1", { text: "Deezer Matching" }), el("p", { class: "muted", text: this.loading ? "Finding matches..." : "Select the best metadata match." })]),
      stack,
      el("div", { class: "actions sticky-actions" }, [
        el("button", { class: "button secondary", type: "button", text: "Back", onclick: () => { updateWorkflowStage(this.state, "youtube"); window.Orpheus.router.go("/discover/youtube"); } }),
        el("button", { class: "button", type: "button", text: "Continue", disabled: this.loading || !this.results.length, onclick: () => this.continue() }),
      ]),
    ]));
  }

  resultCard(result, resultIndex) {
    const matches = el("div", { class: "match-list" });
    for (const [matchIndex, match] of result.trackMatches.entries()) {
      matches.append(el("button", { class: `match-row ${result.selectedMatch?.id === match.id ? "selected" : ""}`, type: "button", onclick: () => this.select(resultIndex, matchIndex) }, [
        match.albumImageUrl ? el("img", { src: match.albumImageUrl, alt: "", loading: "lazy" }) : el("div", { class: "album-placeholder" }),
        el("span", {}, [el("strong", { text: match.name }), el("span", { class: "muted", text: `${match.artist} · ${match.album} · ${match.matchScore}%` })]),
      ]));
    }
    const input = el("input", { class: "input", placeholder: "Custom Deezer query" });
    return el("article", { class: "card" }, [
      el("h2", { text: result.youtubeVideo.title }),
      el("p", { class: "badge", text: result.confidence }),
      matches,
      el("div", { class: "input-row" }, [
        input,
        el("button", { class: "button secondary", type: "button", text: "Search", onclick: () => this.customSearch(resultIndex, input.value) }),
        el("button", { class: "button secondary", type: "button", text: "Skip", onclick: () => this.skip(resultIndex) }),
      ]),
    ]);
  }

  select(resultIndex, matchIndex) {
    this.results[resultIndex].selectedMatch = this.results[resultIndex].trackMatches[matchIndex];
    this.persist();
    this.render();
  }

  skip(resultIndex) {
    delete this.results[resultIndex].selectedMatch;
    this.persist();
    this.render();
  }

  async customSearch(resultIndex, query) {
    if (!query.trim()) return;
    try {
      this.results[resultIndex] = await API.customDeezerMatch(this.results[resultIndex].youtubeVideo, query.trim());
      this.persist();
      this.render();
    } catch (error) {
      showDialog(error.message || "Custom search failed");
    }
  }

  persist() {
    const state = loadWorkflowState();
    state.trackMatches = this.results;
    state.currentStage = "spotify";
    saveWorkflowState(state);
    this.state = state;
  }

  continue() {
    const state = updateWorkflowStage(loadWorkflowState(), "lyrics");
    saveWorkflowState({ ...state, trackMatches: this.results });
    window.Orpheus.router.go("/discover/lyrics");
  }
}

customElements.define("deezer-matching-page", DeezerMatchingPage);
