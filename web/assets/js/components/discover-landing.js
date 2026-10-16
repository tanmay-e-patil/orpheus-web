import { clearWorkflowState, createInitialWorkflowState, deleteNamedDraft, el, getAllDrafts, loadWorkflowState, saveWorkflowState, saveNamedDraft, stageLabels, stageRoutes } from "../store.js";

export class DiscoverLandingPage extends HTMLElement {
  connectedCallback() {
    this.render();
  }

  preserveCurrentSession() {
    const current = loadWorkflowState();
    if (current) saveNamedDraft(current.id, current);
  }

  render() {
    const state = loadWorkflowState();
    const drafts = getAllDrafts();
    const query = el("input", { class: "input", type: "search", required: true, "aria-label": "Search for songs or artists", placeholder: "Search for songs or artists..." });
    const start = el("button", { class: "button", type: "submit", text: "Search songs" });
    const searchForm = el("form", { class: "input-row" }, [query, start]);
    searchForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const value = query.value.trim();
      if (!value) { query.setCustomValidity("Enter a song or artist."); query.reportValidity(); return; }
      this.preserveCurrentSession();
      saveWorkflowState(createInitialWorkflowState(value));
      window.Orpheus.router.go(`/discover/youtube?q=${encodeURIComponent(value)}`);
    });
    query.addEventListener("input", () => query.setCustomValidity(""));
    const children = [
      el("div", { class: "page-header" }, [el("h1", { text: "Add songs" }), el("p", { class: "muted", text: "Find songs, choose metadata, add lyrics, then save to your library." })]),
    ];
    if (this.undo) {
      children.push(el("section", { class: "card", role: "status" }, [
        el("p", { text: this.undo.message }),
        el("button", { class: "button secondary", type: "button", text: "Undo", onclick: () => { this.undo.restore(); this.undo = null; this.render(); } }),
      ]));
    }
    if (state) {
      children.push(el("section", { class: "card" }, [
        el("h2", { text: "Resume Previous Session" }),
        el("p", { class: "muted", text: `${state.searchQuery} · ${stageLabels[state.currentStage] || state.currentStage}` }),
        el("div", { class: "actions" }, [
          el("button", { class: "button secondary", type: "button", text: "Discard session", onclick: () => { this.undo = { message: "Session discarded.", restore: () => { this.preserveCurrentSession(); saveWorkflowState(state); } }; clearWorkflowState(); this.render(); } }),
          el("button", { class: "button", type: "button", text: "Resume", onclick: () => window.Orpheus.router.go(stageRoutes[state.currentStage] || "/discover/youtube") }),
        ]),
      ]));
    }
    const draftEntries = Object.entries(drafts);
    if (draftEntries.length) {
      const list = el("div", { class: "stack" });
      for (const [name, draft] of draftEntries) {
        const label = name === draft.id ? `${draft.searchQuery} · ${new Date(draft.timestamp).toLocaleString()}` : name;
        list.append(el("div", { class: "draft-row" }, [
          el("span", { text: `${label}: ${draft.searchQuery} (${stageLabels[draft.currentStage] || draft.currentStage})` }),
          el("button", { class: "button secondary", type: "button", text: "Delete draft", "aria-label": `Delete draft ${label}`, onclick: () => { this.undo = { message: `Draft “${label}” deleted.`, restore: () => saveNamedDraft(name, draft) }; deleteNamedDraft(name); this.render(); } }),
          el("button", { class: "button", type: "button", text: "Resume draft", onclick: () => { this.preserveCurrentSession(); saveWorkflowState(draft); window.Orpheus.router.go(stageRoutes[draft.currentStage] || "/discover/youtube"); } }),
        ]));
      }
      children.push(el("section", { class: "card" }, [el("h2", { text: "Saved Drafts" }), list]));
    }
    children.push(el("section", { class: "card" }, [
      el("h2", { text: "Find songs to add" }),
      searchForm,
    ]));
    this.replaceChildren(el("section", { class: "page discover-page" }, children));
  }
}

customElements.define("discover-landing-page", DiscoverLandingPage);
