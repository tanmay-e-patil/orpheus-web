// Preserve old draft links while saving now happens directly on Review.
export class CommitLibraryPage extends HTMLElement {
  connectedCallback() {
    window.Orpheus.router.go("/discover/review");
  }
}

customElements.define("commit-library-page", CommitLibraryPage);
