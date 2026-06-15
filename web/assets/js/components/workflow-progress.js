import { el, stageOrder } from "../store.js";

export class WorkflowProgress extends HTMLElement {
  connectedCallback() {
    this.render();
  }

  static get observedAttributes() {
    return ["stage"];
  }

  attributeChangedCallback() {
    this.render();
  }

  render() {
    const current = this.getAttribute("stage") || "youtube";
    const activeIndex = stageOrder.indexOf(current);
    this.replaceChildren(el("ol", { class: "workflow-progress" },
      stageOrder.slice(1).map((stage, index) => el("li", { class: index <= activeIndex - 1 ? "done" : "", text: stage }))
    ));
  }
}

customElements.define("workflow-progress", WorkflowProgress);
