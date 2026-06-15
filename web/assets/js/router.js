import { API } from "./api.js";
import { setSession } from "./store.js";
import { routeTransitionKind, withViewTransition } from "./view-transitions.js";

export const routes = [
  { path: "/", component: "login-page", public: true },
  { path: "/home", component: "home-page", protected: true },
  { path: "/settings", component: "settings-page", protected: true },
  { path: "/discover", component: "discover-landing-page", protected: true },
  { path: "/discover/youtube", component: "youtube-discovery-page", protected: true },
  { path: "/discover/spotify", component: "deezer-matching-page", protected: true },
  { path: "/discover/lyrics", component: "lyrics-enrichment-page", protected: true },
  { path: "/discover/review", component: "review-edit-page", protected: true },
  { path: "/discover/commit", component: "commit-library-page", protected: true },
  { path: "/songs/:trackId/edit", component: "library-song-edit-page", protected: true, match: (path) => /^\/songs\/[^/]+\/edit$/.test(path) },
];

export class Router {
  constructor() {
    this.authShell = document.querySelector("[data-auth-shell]");
    this.publicOutlet = document.getElementById("public-route-outlet");
    this.privateOutlet = document.getElementById("route-outlet");
    this.navigationId = 0;
  }

  start() {
    document.addEventListener("click", (event) => {
      const link = event.target.closest("a[data-link]");
      if (!link || link.origin !== window.location.origin || event.metaKey || event.ctrlKey) return;
      event.preventDefault();
      this.go(link.pathname + link.search);
    });
    window.addEventListener("popstate", () => {
      const fromPath = this.currentPath || "/";
      this.transitionRender(fromPath, window.location.pathname);
    });
    window.addEventListener("orpheus:unauthorized", () => this.go("/"));
    this.render().then(() => {
      this.currentPath = window.location.pathname;
    });
  }

  async go(url) {
    if (url === window.location.pathname + window.location.search) return;
    const fromPath = window.location.pathname;
    history.pushState({}, "", url);
    await this.transitionRender(fromPath, window.location.pathname);
  }

  async transitionRender(fromPath = this.currentPath || "/", toPath = window.location.pathname) {
    const navigationId = ++this.navigationId;
    const plan = await this.createRenderPlan(toPath);
    if (navigationId !== this.navigationId) return;

    if (plan.path !== window.location.pathname) {
      history.replaceState({}, "", plan.path);
    }

    await withViewTransition(() => this.commitRenderPlan(plan), {
      scope: "route",
      routeKind: routeTransitionKind(fromPath, plan.path),
    });
    this.currentPath = window.location.pathname;
  }

  async render() {
    const plan = await this.createRenderPlan(window.location.pathname);
    if (plan.path !== window.location.pathname) {
      history.replaceState({}, "", plan.path);
    }
    this.commitRenderPlan(plan);
  }

  async createRenderPlan(path) {
    let session = null;
    try {
      session = await API.session();
      setSession(session);
    } catch {
      setSession(null);
    }

    const route = routes.find((candidate) => candidate.path === path || candidate.match?.(path)) || routes[0];
    if (route.protected && !session?.authenticated) {
      return { path: "/", route: routes[0], session };
    }
    if (route.public && session?.authenticated) {
      return { path: "/home", route: routes.find((candidate) => candidate.path === "/home"), session };
    }
    return { path, route, session };
  }

  commitRenderPlan({ route }) {
    this.authShell.hidden = true;
    this.publicOutlet.hidden = true;

    if (route.public) {
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
