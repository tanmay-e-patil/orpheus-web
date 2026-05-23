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
    this.customQueryOpen = {};
    this.customQueryLoading = {};
    this.customQueryInputs = {};
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
    const matched = this.results.filter((result) => result.selectedMatch).length;
    const skipped = Math.max(0, this.results.length - matched);
    this.replaceChildren(el("section", { class: "page" }, [
      el("workflow-progress", { stage: "spotify" }),
      el("div", { class: "page-header" }, [el("h1", { text: "Deezer Matching" }), el("p", { class: "muted", text: this.loading ? "Finding matches..." : "Select the best metadata match." })]),
      this.loading ? el("section", { class: "card loading-card" }, [
        el("span", { class: "spinner", "aria-hidden": "true" }),
        el("span", { text: `Processing ${this.selectedVideos.length} videos` }),
      ]) : null,
      !this.loading && this.results.length ? el("p", { class: "muted workflow-summary", text: `Found matches for ${this.results.length} videos · ${matched} matched · ${skipped} skipped` }) : null,
      stack,
      el("div", { class: "actions sticky-actions" }, [
        el("button", { class: "button secondary", type: "button", text: "Back", onclick: () => { updateWorkflowStage(this.state, "youtube"); window.Orpheus.router.go("/discover/youtube"); } }),
        el("button", { class: "button", type: "button", text: "Continue", disabled: this.loading || !this.results.length, onclick: () => this.continue() }),
      ]),
    ]));
  }

  resultCard(result, resultIndex) {
    const matches = el("div", { class: "match-list" });
    const visibleMatches = result.trackMatches.slice(0, 3);
    for (const [matchIndex, match] of visibleMatches.entries()) {
      matches.append(el("button", { class: `match-row ${result.selectedMatch?.id === match.id ? "selected" : ""}`, type: "button", onclick: () => this.select(resultIndex, matchIndex) }, [
        match.albumImageUrl ? el("img", { src: match.albumImageUrl, alt: "", loading: "lazy" }) : el("div", { class: "album-placeholder" }),
        el("span", {}, [
          el("strong", { text: match.name }),
          el("span", { class: "muted", text: `${match.artist} · ${match.album}` }),
          el("span", { class: "muted", text: compactMetadata([match.releaseDate, formatMs(match.durationMs), `${match.matchScore}% match`]) }),
        ]),
        result.selectedMatch?.id === match.id ? el("span", { class: "badge success", text: "Selected" }) : el("span", { class: "badge", text: `${match.matchScore}%` }),
      ]));
    }
    if (result.trackMatches.length > visibleMatches.length) {
      matches.append(el("p", { class: "muted compact-note", text: `Showing top 3 of ${result.trackMatches.length} matches` }));
    }
    const input = el("input", { class: "input", placeholder: "Custom Deezer query", value: this.customQueryInputs[resultIndex] || "" });
    input.addEventListener("input", () => { this.customQueryInputs[resultIndex] = input.value; });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") this.customSearch(resultIndex, input.value);
    });
    const customSearch = this.customQueryOpen[resultIndex] ? el("div", { class: "input-row" }, [
      input,
      el("button", { class: "button secondary", type: "button", text: this.customQueryLoading[resultIndex] ? "Searching..." : "Search", disabled: this.customQueryLoading[resultIndex], onclick: () => this.customSearch(resultIndex, input.value) }),
    ]) : null;
    return el("article", { class: "card" }, [
      el("div", { class: "card-header-row" }, [
        el("span", {}, [
          el("h2", { text: result.youtubeVideo.title }),
          el("span", { class: "muted", text: compactMetadata([result.youtubeVideo.channelTitle, formatDuration(result.youtubeVideo.duration)]) }),
        ]),
        el("span", { class: `badge ${confidenceTone(result.confidence)}`, text: `${result.confidence} confidence` }),
      ]),
      result.trackMatches.length ? matches : el("section", { class: "empty-state compact" }, [
        el("h3", { text: "No matches found" }),
        el("p", { class: "muted", text: "Skip this video or try a different Deezer query." }),
      ]),
      el("div", { class: "actions split-actions" }, [
        el("button", { class: "button secondary", type: "button", text: "Skip", onclick: () => this.skip(resultIndex) }),
        el("button", { class: "button secondary", type: "button", text: this.customQueryOpen[resultIndex] ? "Hide Search" : "Try Different Search", onclick: () => { this.customQueryOpen[resultIndex] = !this.customQueryOpen[resultIndex]; this.render(); } }),
      ]),
      customSearch,
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
    this.customQueryLoading[resultIndex] = true;
    this.render();
    try {
      this.results[resultIndex] = await API.customDeezerMatch(this.results[resultIndex].youtubeVideo, query.trim());
      this.customQueryOpen[resultIndex] = false;
      this.persist();
      this.render();
    } catch (error) {
      showDialog(error.message || "Custom search failed");
    } finally {
      this.customQueryLoading[resultIndex] = false;
      this.render();
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

function formatDuration(duration) {
  if (!duration) return "Unknown";
  const match = String(duration).match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return duration;
  const hours = Number(match[1] || 0);
  const minutes = Number(match[2] || 0);
  const seconds = Number(match[3] || 0);
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatMs(ms) {
  if (typeof ms !== "number") return "";
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function compactMetadata(values) {
  return values.filter(Boolean).join(" · ");
}

function confidenceTone(confidence) {
  if (confidence === "high") return "success";
  if (confidence === "medium") return "warning";
  if (confidence === "low") return "caution";
  return "danger";
}

customElements.define("deezer-matching-page", DeezerMatchingPage);
