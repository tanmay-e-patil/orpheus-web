import { el, stageLabels, stageOrder, stageRoutes } from "../store.js";

export class WorkflowProgress extends HTMLElement {
  connectedCallback() {
    this.render();
  }

  static get observedAttributes() {
    return ["stage", "locked"];
  }

  attributeChangedCallback() {
    this.render();
  }

  render() {
    const current = this.getAttribute("stage") || "youtube";
    const activeIndex = stageOrder.indexOf(current);
    this.replaceChildren(el("ol", { class: "workflow-progress", "aria-label": "Discovery progress" },
      stageOrder.slice(1).map((stage, index) => {
        const done = index < activeIndex - 1;
        const active = index === activeIndex - 1;
        const label = stageLabels[stage] || stage;
        const content = [
          el("span", { class: "workflow-step-dot", "aria-hidden": "true", text: done ? "✓" : String(index + 1) }),
          el("span", { class: "workflow-step-label", text: label }),
        ];
        return el("li", { class: done ? "done" : active ? "active" : "" }, [
          done && !this.hasAttribute("locked")
            ? el("a", { href: stageRoutes[stage], "data-link": "", "aria-label": `Back to ${label}` }, content)
            : el("span", active ? { "aria-current": "step" } : {}, content),
        ]);
      })
    ));
  }
}

customElements.define("workflow-progress", WorkflowProgress);
