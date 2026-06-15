import { clearWorkflowState, createInitialWorkflowState, deleteNamedDraft, el, getAllDrafts, loadWorkflowState, saveWorkflowState, stageRoutes } from "../store.js";

export class DiscoverLandingPage extends HTMLElement {
  connectedCallback() {
    this.render();
  }

  render() {
    const state = loadWorkflowState();
    const drafts = getAllDrafts();
    const query = el("input", { class: "input", placeholder: "Search for music..." });
    const start = el("button", { class: "button", type: "button", text: "Start Discovery" });
    start.addEventListener("click", () => {
      const value = query.value.trim();
      if (!value) return;
      clearWorkflowState();
      saveWorkflowState(createInitialWorkflowState(value));
      window.Orpheus.router.go(`/discover/youtube?q=${encodeURIComponent(value)}`);
    });
    const children = [
      el("div", { class: "page-header" }, [el("h1", { text: "Discover" }), el("p", { class: "muted", text: "Build new library entries from YouTube, Deezer, and LRCLIB." })]),
    ];
    if (state) {
      children.push(el("section", { class: "card" }, [
        el("h2", { text: "Resume Previous Session" }),
        el("p", { class: "muted", text: `${state.searchQuery} · ${state.currentStage}` }),
        el("div", { class: "actions" }, [
          el("button", { class: "button secondary", type: "button", text: "Clear", onclick: () => { clearWorkflowState(); this.render(); } }),
          el("button", { class: "button", type: "button", text: "Resume", onclick: () => window.Orpheus.router.go(stageRoutes[state.currentStage] || "/discover/youtube") }),
        ]),
      ]));
    }
    const draftEntries = Object.entries(drafts);
    if (draftEntries.length) {
      const list = el("div", { class: "stack" });
      for (const [name, draft] of draftEntries) {
        list.append(el("div", { class: "draft-row" }, [
          el("span", { text: `${name}: ${draft.searchQuery} (${draft.currentStage})` }),
          el("button", { class: "button secondary", type: "button", text: "Delete", onclick: () => { deleteNamedDraft(name); this.render(); } }),
          el("button", { class: "button", type: "button", text: "Load", onclick: () => window.Orpheus.router.go(stageRoutes[draft.currentStage] || "/discover/youtube") }),
        ]));
      }
      children.push(el("section", { class: "card" }, [el("h2", { text: "Saved Drafts" }), list]));
    }
    children.push(el("section", { class: "card" }, [
      el("h2", { text: "Start New Discovery" }),
      el("div", { class: "input-row" }, [query, start]),
    ]));
    this.replaceChildren(el("section", { class: "page discover-page" }, children));
  }
}

customElements.define("discover-landing-page", DiscoverLandingPage);
