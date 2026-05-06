import { API } from "./api.js";
import { setSession } from "./store.js";

export const routes = [
  { path: "/", component: "login-page", public: true },
  { path: "/home", component: "home-page", protected: true },
  { path: "/discover", component: "discover-landing-page", protected: true },
  { path: "/discover/youtube", component: "youtube-discovery-page", protected: true },
  { path: "/discover/spotify", component: "deezer-matching-page", protected: true },
  { path: "/discover/lyrics", component: "lyrics-enrichment-page", protected: true },
  { path: "/discover/review", component: "review-edit-page", protected: true },
  { path: "/discover/commit", component: "commit-library-page", protected: true },
];

export class Router {
  constructor() {
    this.authShell = document.querySelector("[data-auth-shell]");
    this.publicOutlet = document.getElementById("public-route-outlet");
    this.privateOutlet = document.getElementById("route-outlet");
  }

  start() {
    document.addEventListener("click", (event) => {
      const link = event.target.closest("a[data-link]");
      if (!link || link.origin !== window.location.origin || event.metaKey || event.ctrlKey) return;
      event.preventDefault();
      this.go(link.pathname + link.search);
    });
    window.addEventListener("popstate", () => this.render());
    window.addEventListener("orpheus:unauthorized", () => this.go("/"));
    this.render();
  }

  async go(url) {
    history.pushState({}, "", url);
    await this.render();
  }

  async render() {
    const route = routes.find((candidate) => candidate.path === window.location.pathname) || routes[0];
    this.authShell.hidden = true;
    this.publicOutlet.hidden = true;

    let session = null;
    try {
      session = await API.session();
      setSession(session);
    } catch {
      setSession(null);
    }
    if (route.protected && !session?.authenticated) {
      history.replaceState({}, "", "/");
      return this.render();
    }
    if (route.public) {
      if (session?.authenticated) {
        history.replaceState({}, "", "/home");
        return this.render();
      }
      this.publicOutlet.hidden = false;
      this.publicOutlet.replaceChildren(document.createElement(route.component));
      this.publicOutlet.focus({ preventScroll: true });
      return;
    }

    this.authShell.hidden = false;
    const outlet = route.protected ? this.privateOutlet : this.publicOutlet;
    outlet.replaceChildren(document.createElement(route.component));
    outlet.focus({ preventScroll: true });
    this.markActiveNav();
  }

  markActiveNav() {
    document.querySelectorAll("[data-nav-path]").forEach((link) => {
      const path = link.getAttribute("data-nav-path");
      link.toggleAttribute("aria-current", window.location.pathname === path || (path === "/discover" && window.location.pathname.startsWith("/discover")));
    });
  }
}
