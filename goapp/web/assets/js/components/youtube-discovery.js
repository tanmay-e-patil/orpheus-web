import { API } from "../api.js";
import { createInitialWorkflowState, el, loadWorkflowState, saveWorkflowState, showDialog, updateWorkflowStage } from "../store.js";

export class YouTubeDiscoveryPage extends HTMLElement {
  connectedCallback() {
    this.abort = null;
    const params = new URLSearchParams(window.location.search);
    this.searchQuery = params.get("q") || loadWorkflowState()?.searchQuery || "";
    this.videos = [];
    this.render();
    const state = loadWorkflowState();
    if (state?.selectedVideos?.length) {
      this.searchQuery = state.searchQuery;
      this.videos = state.selectedVideos;
      updateWorkflowStage(state, "youtube");
      this.render();
    } else if (this.searchQuery) {
      this.search(this.searchQuery);
    }
  }

  disconnectedCallback() {
    this.abort?.abort();
  }

  async search(query) {
    if (!query.trim()) return;
    this.abort?.abort();
    this.abort = new AbortController();
    this.loading = true;
    this.render();
    try {
      this.videos = await API.discoverYouTube(query.trim(), this.abort.signal);
      let state = loadWorkflowState() || createInitialWorkflowState(query.trim());
      state = { ...state, searchQuery: query.trim(), selectedVideos: this.videos, currentStage: "youtube" };
      saveWorkflowState(state);
    } catch (error) {
      if (error.name !== "AbortError") showDialog(error.message || "YouTube search failed");
    } finally {
      this.loading = false;
      this.render();
    }
  }

  render() {
    const input = el("input", { class: "input", value: this.searchQuery || "", placeholder: "Search YouTube..." });
    input.addEventListener("input", () => { this.searchQuery = input.value; });
    input.addEventListener("keydown", (event) => { if (event.key === "Enter") this.search(this.searchQuery); });
    const selected = this.videos.filter((video) => video.selected);
    const grid = el("div", { class: "result-grid" });
    for (const video of this.videos) grid.append(this.videoCard(video));
    this.replaceChildren(el("section", { class: "page" }, [
      el("workflow-progress", { stage: "youtube" }),
      el("div", { class: "page-header" }, [el("h1", { text: "YouTube Discovery" }), el("p", { class: "muted", text: `${selected.length} selected` })]),
      el("div", { class: "input-row" }, [input, el("button", { class: "button", type: "button", text: this.loading ? "Searching..." : "Search", onclick: () => this.search(this.searchQuery) })]),
      el("div", { class: "actions" }, [
        el("button", { class: "button secondary", type: "button", text: "Select All", onclick: () => this.setAll(true) }),
        el("button", { class: "button secondary", type: "button", text: "Deselect All", onclick: () => this.setAll(false) }),
        el("button", { class: "button", type: "button", text: "Continue", disabled: selected.length === 0, onclick: () => this.continue() }),
      ]),
      grid,
    ]));
  }

  videoCard(video) {
    const card = el("article", { class: `result-card ${video.selected ? "selected" : ""}` }, [
      video.thumbnail ? el("img", { src: video.thumbnail, alt: "", loading: "lazy" }) : null,
      el("h2", { text: video.title }),
      el("p", { class: "muted", text: video.channelTitle }),
      el("p", { class: "badge", text: `${video.confidence}% confidence` }),
      el("div", { class: "actions" }, [
        el("button", { class: "button secondary", type: "button", text: video.selected ? "Selected" : "Select", onclick: () => this.toggle(video.id) }),
        el("button", { class: "button secondary", type: "button", text: "Preview", onclick: () => this.preview(video) }),
      ]),
    ]);
    return card;
  }

  toggle(id) {
    this.videos = this.videos.map((video) => video.id === id ? { ...video, selected: !video.selected } : video);
    this.persist();
    this.render();
  }

  setAll(selected) {
    this.videos = this.videos.map((video) => ({ ...video, selected }));
    this.persist();
    this.render();
  }

  persist() {
    const state = loadWorkflowState() || createInitialWorkflowState(this.searchQuery);
    state.selectedVideos = this.videos;
    state.searchQuery = this.searchQuery;
    state.currentStage = "youtube";
    saveWorkflowState(state);
  }

  preview(video) {
    const dialog = document.getElementById("app-dialog");
    const message = document.getElementById("app-dialog-message");
    message.replaceChildren(el("iframe", { title: video.title, src: `https://www.youtube.com/embed/${encodeURIComponent(video.id)}`, allow: "autoplay; encrypted-media", allowfullscreen: true }));
    dialog.showModal();
  }

  continue() {
    const state = loadWorkflowState();
    updateWorkflowStage(state, "spotify");
    window.Orpheus.router.go("/discover/spotify");
  }
}

customElements.define("youtube-discovery-page", YouTubeDiscoveryPage);
