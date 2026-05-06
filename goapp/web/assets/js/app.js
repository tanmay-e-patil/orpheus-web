import { Router } from "./router.js";
import { API } from "./api.js";
import { toast } from "./store.js";
import { initYouTubePlayer } from "./youtube-player.js";

import "./components/app-shell.js";
import "./components/login-page.js";
import "./components/home-page.js";
import "./components/song-table.js";
import "./components/player-bar.js";
import "./components/lyrics-view.js";
import "./components/mobile-nav.js";
import "./components/discover-landing.js";
import "./components/workflow-progress.js";
import "./components/youtube-discovery.js";
import "./components/deezer-matching.js";
import "./components/lyrics-enrichment.js";
import "./components/review-edit.js";
import "./components/commit-library.js";

const router = new Router();
window.Orpheus = { router };

document.querySelectorAll(".sign-out-button").forEach((button) => {
  button.addEventListener("click", async () => {
    await API.logout();
    toast("Signed out");
    router.go("/");
  });
});

document.querySelector("[data-close-lyrics]")?.addEventListener("click", () => {
  document.getElementById("lyrics-overlay")?.close();
});

initYouTubePlayer();
router.start();
