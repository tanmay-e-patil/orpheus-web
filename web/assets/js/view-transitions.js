import { stageOrder } from "./store.js";

const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

export function prefersReducedMotion() {
  return reducedMotionQuery.matches;
}

export function supportsViewTransitions() {
  return Boolean(document.startViewTransition);
}

export async function withViewTransition(callback, options = {}) {
  if (!supportsViewTransitions() || prefersReducedMotion()) {
    return callback();
  }

  const root = document.documentElement;
  const previousRoute = root.dataset.routeTransition;
  const previousSong = root.dataset.songTransition;
  setTransitionDataset(root, options);

  let result;
  try {
    const transition = document.startViewTransition(() => {
      result = callback();
      return result;
    });
    await transition.finished.catch(() => {});
  } finally {
    restoreTransitionDataset(root, "routeTransition", previousRoute);
    restoreTransitionDataset(root, "songTransition", previousSong);
  }
  return result;
}

export function routeTransitionKind(fromPath, toPath) {
  if (fromPath === toPath) return "generic";
  if (fromPath === "/home" && isDiscoverPath(toPath)) return "tracks-to-discover";
  if (isDiscoverPath(fromPath) && toPath === "/home") return "discover-to-tracks";
  if (isDiscoverPath(fromPath) && isDiscoverPath(toPath)) {
    const fromIndex = discoverRouteIndex(fromPath);
    const toIndex = discoverRouteIndex(toPath);
    if (toIndex > fromIndex) return "discover-forward";
    if (toIndex < fromIndex) return "discover-back";
  }
  return "generic";
}

function setTransitionDataset(root, options) {
  if (options.scope === "route") {
    root.dataset.routeTransition = options.routeKind || "generic";
    delete root.dataset.songTransition;
  }
  if (options.scope === "song") {
    root.dataset.songTransition = options.songKind || "select";
  }
}

function restoreTransitionDataset(root, key, previousValue) {
  if (previousValue == null) {
    delete root.dataset[key];
    return;
  }
  root.dataset[key] = previousValue;
}

function isDiscoverPath(path) {
  return path === "/discover" || path.startsWith("/discover/");
}

function discoverRouteIndex(path) {
  const stage = discoverStage(path);
  const index = stageOrder.indexOf(stage);
  return index >= 0 ? index : 0;
}

function discoverStage(path) {
  if (path === "/discover") return "search";
  const segment = path.split("/")[2];
  if (segment === "youtube") return "youtube";
  if (segment === "spotify") return "spotify";
  if (segment === "lyrics") return "lyrics";
  if (segment === "review") return "review";
  if (segment === "commit") return "commit";
  return "search";
}
