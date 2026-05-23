import { API } from "../api.js";
import { createInitialWorkflowState, el, loadWorkflowState, saveWorkflowState, showDialog, updateWorkflowStage } from "../store.js";

export class YouTubeDiscoveryPage extends HTMLElement {
  connectedCallback() {
    this.abort = null;
    const params = new URLSearchParams(window.location.search);
    this.searchQuery = params.get("q") || loadWorkflowState()?.searchQuery || "";
    this.videos = [];
    this.hasSearched = false;
    this.render();
    const state = loadWorkflowState();
    if (state?.selectedVideos?.length) {
      this.searchQuery = state.searchQuery;
      this.videos = state.selectedVideos;
      this.hasSearched = true;
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
      this.hasSearched = true;
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
    const status = this.hasSearched
      ? `Found ${this.videos.length} videos · ${selected.length} selected`
      : `${selected.length} selected`;
    this.replaceChildren(el("section", { class: "page" }, [
      el("workflow-progress", { stage: "youtube" }),
      el("div", { class: "page-header" }, [el("h1", { text: "YouTube Discovery" }), el("p", { class: "muted", text: status })]),
      el("div", { class: "input-row" }, [input, el("button", { class: "button", type: "button", text: this.loading ? "Searching..." : "Search", onclick: () => this.search(this.searchQuery) })]),
      this.loading ? el("section", { class: "card loading-card" }, [
        el("span", { class: "spinner", "aria-hidden": "true" }),
        el("span", { text: "Searching YouTube..." }),
      ]) : null,
      this.hasSearched && this.videos.length ? el("div", { class: "actions split-actions" }, [
        el("span", { class: "muted", text: status }),
        el("span", { class: "actions" }, [
          el("button", { class: "button secondary", type: "button", text: "Select All", onclick: () => this.setAll(true) }),
          el("button", { class: "button secondary", type: "button", text: "Deselect All", onclick: () => this.setAll(false) }),
          el("button", { class: "button", type: "button", text: "Continue", disabled: selected.length === 0, onclick: () => this.continue() }),
        ]),
      ]) : null,
      this.hasSearched && !this.loading && !this.videos.length ? el("section", { class: "empty-state" }, [
        el("h2", { text: "No videos found" }),
        el("p", { class: "muted", text: "Try a different search query." }),
      ]) : grid,
    ]));
  }

  videoCard(video) {
    const card = el("article", {
      class: `result-card video-result-card ${video.selected ? "selected" : ""}`,
      tabindex: "0",
      role: "button",
      "aria-pressed": video.selected ? "true" : "false",
      onclick: () => this.toggle(video.id),
      onkeydown: (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          this.toggle(video.id);
        }
      },
    }, [
      el("div", { class: "video-thumb" }, [
        video.thumbnail ? el("img", { src: video.thumbnail, alt: "", loading: "lazy" }) : null,
        el("span", { class: `video-check ${video.selected ? "checked" : ""}`, text: video.selected ? "✓" : "" }),
        el("span", { class: `badge confidence-badge ${confidenceTone(video.confidence)}`, text: `${video.confidence}% match` }),
        el("span", { class: "video-duration", text: formatDuration(video.duration) }),
        el("button", {
          class: "icon-overlay-button",
          type: "button",
          "aria-label": `Preview ${video.title}`,
          onclick: (event) => {
            event.stopPropagation();
            this.preview(video);
          },
        }, ["▶"]),
      ]),
      el("div", { class: "video-card-body" }, [
        el("h2", { text: video.title }),
        el("p", { class: "muted", text: video.channelTitle }),
        el("div", { class: "metadata-row" }, [
          el("span", { text: formatViewCount(video.viewCount) }),
          el("span", { text: formatDuration(video.duration) }),
        ]),
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
    message.replaceChildren(el("div", { class: "preview-dialog-content" }, [
      el("h2", { text: video.title }),
      el("p", { class: "muted", text: video.channelTitle }),
      el("div", { class: "video-preview-frame" }, [
        el("iframe", {
          title: video.title,
          src: `https://www.youtube.com/embed/${encodeURIComponent(video.id)}?autoplay=1&rel=0&modestbranding=1`,
          allow: "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture",
          allowfullscreen: true,
        }),
      ]),
      el("div", { class: "metadata-row" }, [
        el("span", { class: `badge ${confidenceTone(video.confidence)}`, text: `${video.confidence}% match` }),
        el("span", { text: formatViewCount(video.viewCount) }),
        el("span", { text: formatDuration(video.duration) }),
      ]),
      el("button", { class: "button", type: "button", text: video.selected ? "Selected" : "Select Video", onclick: () => { this.toggle(video.id); dialog.close(); } }),
    ]));
    dialog.showModal();
  }

  continue() {
    const state = loadWorkflowState();
    updateWorkflowStage(state, "spotify");
    window.Orpheus.router.go("/discover/spotify");
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

function formatViewCount(viewCount) {
  const count = Number(viewCount);
  if (!Number.isFinite(count) || count <= 0) return "Unknown views";
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M views`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K views`;
  return `${count} views`;
}

function confidenceTone(confidence) {
  if (confidence >= 70) return "success";
  if (confidence >= 50) return "warning";
  return "danger";
}

customElements.define("youtube-discovery-page", YouTubeDiscoveryPage);
