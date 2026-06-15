import { API } from "../api.js";
import { findActiveIndex, parseLRC } from "../lrc.js";
import { el, loadWorkflowState, saveWorkflowState, showDialog, updateWorkflowStage } from "../store.js";

export class LyricsEnrichmentPage extends HTMLElement {
  connectedCallback() {
    this.state = loadWorkflowState();
    if (!this.state) {
      window.Orpheus.router.go("/discover");
      return;
    }
    this.matchedResults = this.state.trackMatches.filter((result) => result.selectedMatch);
    this.tracks = this.matchedResults.map((result) => result.selectedMatch);
    this.results = this.state.lyricsSearchResults || [];
    this.customQueryOpen = {};
    this.customQueryLoading = {};
    this.customQueryInputs = {};
    this.syncTestOpen = {};
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
    if (!this.tracks.length) {
      this.replaceChildren(el("section", { class: "page" }, [
        el("workflow-progress", { stage: "lyrics" }),
        el("section", { class: "empty-state" }, [
          el("h1", { text: "No Matched Tracks" }),
          el("p", { class: "muted", text: "Select Deezer matches before looking up lyrics." }),
          el("button", { class: "button", type: "button", text: "Back to Matching", onclick: () => window.Orpheus.router.go("/discover/spotify") }),
        ]),
      ]));
      return;
    }
    const stack = el("div", { class: "stack" });
    for (const [index, result] of this.results.entries()) stack.append(this.resultCard(result, index));
    const withLyrics = this.results.filter((result) => result.selectedOption).length;
    const skipped = Math.max(0, this.results.length - withLyrics);
    this.replaceChildren(el("section", { class: "page" }, [
      el("workflow-progress", { stage: "lyrics" }),
      el("div", { class: "page-header" }, [el("h1", { text: "Lyrics Enrichment" }), el("p", { class: "muted", text: this.loading ? "Searching LRCLIB..." : "Choose lyrics for each matched track." })]),
      this.loading ? el("section", { class: "card loading-card" }, [
        el("span", { class: "spinner", "aria-hidden": "true" }),
        el("span", { text: `Processing ${this.tracks.length} tracks` }),
      ]) : null,
      !this.loading && this.results.length ? el("p", { class: "muted workflow-summary", text: `Searched lyrics for ${this.results.length} tracks · ${withLyrics} with lyrics · ${skipped} skipped` }) : null,
      stack,
      el("div", { class: "actions sticky-actions" }, [
        el("button", { class: "button secondary", type: "button", text: "Back", onclick: () => { updateWorkflowStage(loadWorkflowState(), "spotify"); window.Orpheus.router.go("/discover/spotify"); } }),
        el("button", { class: "button", type: "button", text: "Continue", disabled: this.loading, onclick: () => this.continue() }),
      ]),
    ]));
  }

  resultCard(result, resultIndex) {
    const options = el("div", { class: "match-list" });
    const visibleOptions = result.options.slice(0, 3);
    const matchedResult = this.matchedResults.find((candidate) => candidate.selectedMatch?.id === result.trackId);
    for (const [optionIndex, option] of visibleOptions.entries()) {
      const isSelected = result.selectedOption?.id === option.id;
      options.append(el("article", { class: `lyrics-option ${isSelected ? "selected" : ""}` }, [
        el("button", { class: "match-row", type: "button", onclick: () => this.select(resultIndex, optionIndex) }, [
          el("span", {}, [
            el("strong", { text: `${option.trackName} - ${option.artistName}` }),
            el("span", { class: "muted", text: compactMetadata([option.albumName, formatSeconds(option.duration), option.hasSync ? "Synced" : "Plain"]) }),
          ]),
          el("span", { class: `badge ${confidenceTone(option.confidence)}`, text: `${option.confidence}%` }),
        ]),
        option.plainLyrics ? el("div", { class: "lyrics-snippet", text: firstLines(option.plainLyrics, 3) }) : null,
        isSelected ? this.selectedLyricsPreview(option, resultIndex, matchedResult) : null,
      ]));
    }
    if (result.options.length > visibleOptions.length) {
      options.append(el("p", { class: "muted compact-note", text: `Showing top 3 of ${result.options.length} options` }));
    }
    const input = el("input", { class: "input", placeholder: "Custom lyrics query", value: this.customQueryInputs[resultIndex] || "" });
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
          el("h2", { text: `${result.query.track} - ${result.query.artist}` }),
          el("span", { class: "muted", text: result.query.album || "" }),
        ]),
        el("span", { class: `badge ${statusTone(result.status)}`, text: result.status }),
      ]),
      result.options.length ? options : el("section", { class: "empty-state compact" }, [
        el("h3", { text: "No lyrics found" }),
        el("p", { class: "muted", text: "Continue without lyrics or try a different search." }),
      ]),
      el("div", { class: "actions split-actions" }, [
        el("button", { class: "button secondary", type: "button", text: "Skip", onclick: () => this.skip(resultIndex) }),
        el("button", { class: "button secondary", type: "button", text: this.customQueryOpen[resultIndex] ? "Hide Search" : "Try Different Search", onclick: () => { this.customQueryOpen[resultIndex] = !this.customQueryOpen[resultIndex]; this.render(); } }),
      ]),
      customSearch,
    ]);
  }

  selectedLyricsPreview(option, resultIndex, matchedResult) {
    const syncKey = `${resultIndex}-${option.id}`;
    return el("div", { class: "selected-lyrics-preview" }, [
      el("div", { class: "lyrics-preview-grid" }, [
        el("section", {}, [
          el("h4", { text: "Plain Lyrics" }),
          el("pre", { class: "lyrics-preview", text: option.plainLyrics || "No plain lyrics available" }),
        ]),
        option.syncedLyrics ? el("section", {}, [
          el("h4", { text: "Synced (LRC)" }),
          el("pre", { class: "lyrics-preview", text: option.syncedLyrics }),
        ]) : null,
      ]),
      option.hasSync && option.syncedLyrics && matchedResult?.youtubeVideo?.id ? el("div", { class: "sync-test-shell" }, [
        this.syncTestOpen[syncKey]
          ? el("lyrics-sync-test", {
            "data-video-id": matchedResult.youtubeVideo.id,
            "data-lyrics": option.syncedLyrics,
            "data-key": syncKey,
          })
          : el("button", { class: "button secondary", type: "button", text: "Test Sync", onclick: () => { this.syncTestOpen[syncKey] = true; this.render(); } }),
      ]) : null,
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
    this.customQueryLoading[resultIndex] = true;
    this.render();
    try {
      this.results[resultIndex] = await API.customLyricsSearch(track, query.trim());
      this.customQueryOpen[resultIndex] = false;
      this.persist();
      this.render();
    } catch (error) {
      showDialog(error.message || "Custom lyrics search failed");
    } finally {
      this.customQueryLoading[resultIndex] = false;
      this.render();
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

let youtubeAPIPromise = null;

class LyricsSyncTest extends HTMLElement {
  connectedCallback() {
    this.videoId = this.getAttribute("data-video-id");
    this.lines = parseLRC(this.getAttribute("data-lyrics") || "");
    this.currentTime = 0;
    this.status = "loading";
    this.render();
    this.load();
  }

  disconnectedCallback() {
    this.stopPolling();
    this.player?.destroy?.();
  }

  render() {
    this.linesNode = el("div", { class: "sync-lines" }, this.lines.length
      ? this.lines.map((line, index) => el("p", { dataset: { index: String(index) }, text: line.text }))
      : [el("p", { class: "muted", text: "No synced lines parsed." })]);
    this.playButton = el("button", { class: "button secondary", type: "button", text: "Pause", onclick: () => this.toggle() });
    this.timeNode = el("span", { class: "muted youtube-player-time", text: "0:00" });
    this.mount = el("div", { class: "sync-video-frame" });
    this.replaceChildren(el("section", { class: "sync-test" }, [
      el("div", { class: "dialog-header" }, [
        el("strong", { text: "Sync test" }),
        el("button", { class: "icon-button", type: "button", "aria-label": "Close sync test", onclick: () => this.remove() }, ["×"]),
      ]),
      this.mount,
      this.linesNode,
      el("div", { class: "youtube-player-controls-row" }, [this.playButton, this.timeNode]),
    ]));
  }

  async load() {
    try {
      const YT = await loadYouTubeAPI();
      await new Promise((resolve) => {
        this.player = new YT.Player(this.mount, {
          width: "100%",
          height: "100%",
          videoId: this.videoId,
          playerVars: { autoplay: 1, controls: 1, modestbranding: 1, rel: 0, playsinline: 1 },
          events: {
            onReady: () => {
              this.player.playVideo?.();
              resolve();
            },
          },
        });
      });
      this.status = "playing";
      this.startPolling();
      this.update();
    } catch {
      this.replaceChildren(el("p", { class: "error", text: "Unable to load sync test." }));
    }
  }

  toggle() {
    if (!this.player) return;
    if (this.status === "playing") {
      this.player.pauseVideo?.();
      this.status = "paused";
    } else {
      this.player.playVideo?.();
      this.status = "playing";
    }
    this.update();
  }

  startPolling() {
    if (this.timer) return;
    this.timer = window.setInterval(() => this.update(), 250);
  }

  stopPolling() {
    if (!this.timer) return;
    window.clearInterval(this.timer);
    this.timer = 0;
  }

  update() {
    const current = Number(this.player?.getCurrentTime?.()) || 0;
    const active = findActiveIndex(this.lines, current * 1000);
    this.timeNode.textContent = formatSeconds(current);
    this.playButton.textContent = this.status === "playing" ? "Pause" : "Play";
    this.linesNode.querySelectorAll("p").forEach((line) => {
      line.classList.toggle("active", Number(line.dataset.index) === active);
    });
    if (active === this.activeLineIndex) return;
    this.activeLineIndex = active;
    const activeLine = this.linesNode.querySelector("p.active");
    if (!activeLine) return;
    this.linesNode.scrollTo({
      top: activeLine.offsetTop - this.linesNode.offsetTop - (this.linesNode.clientHeight / 2) + (activeLine.clientHeight / 2),
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  }
}

function loadYouTubeAPI() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (youtubeAPIPromise) return youtubeAPIPromise;
  youtubeAPIPromise = new Promise((resolve) => {
    const previousReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previousReady?.();
      resolve(window.YT);
    };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    document.head.append(script);
  });
  return youtubeAPIPromise;
}

function firstLines(text, count) {
  return String(text || "").split(/\r?\n/).filter(Boolean).slice(0, count).join("\n");
}

function formatSeconds(seconds) {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return "";
  const total = Math.floor(seconds);
  const minutes = Math.floor(total / 60);
  const remaining = total % 60;
  return `${minutes}:${String(remaining).padStart(2, "0")}`;
}

function compactMetadata(values) {
  return values.filter(Boolean).join(" · ");
}

function confidenceTone(confidence) {
  if (confidence >= 70) return "success";
  if (confidence >= 50) return "warning";
  return "danger";
}

function statusTone(status) {
  if (status === "found") return "success";
  if (status === "partial") return "warning";
  return "danger";
}

customElements.define("lyrics-sync-test", LyricsSyncTest);
customElements.define("lyrics-enrichment-page", LyricsEnrichmentPage);
