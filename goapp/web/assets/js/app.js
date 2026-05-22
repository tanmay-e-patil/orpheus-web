import { Router } from "./router.js";
import { API } from "./api.js";
import { toast } from "./store.js";
import { initAudioPlayer } from "./audio-player.js";
import { clearPlayer } from "./player-store.js";
import { initThemeControls } from "./theme.js";

import "./components/app-shell.js";
import "./components/login-page.js";
import "./components/home-page.js";
import "./components/settings-page.js";
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

const authShell = document.querySelector("[data-auth-shell]");
const sidebar = authShell?.querySelector(".sidebar");
const sidebarCollapsed = localStorage.getItem("orpheus-sidebar-collapsed") === "true";
setSidebarCollapsed(sidebarCollapsed);

function setSidebarCollapsed(collapsed) {
  authShell?.classList.toggle("sidebar-collapsed", collapsed);
  sidebar?.toggleAttribute("inert", collapsed);
  sidebar?.setAttribute("aria-hidden", String(collapsed));
}

document.querySelectorAll(".sign-out-button").forEach((button) => {
  button.addEventListener("click", async () => {
    await API.logout();
    clearPlayer();
    toast("Signed out");
    router.go("/");
  });
});

window.addEventListener("orpheus:unauthorized", () => clearPlayer());

document.querySelector("[data-close-lyrics]")?.addEventListener("click", () => {
  document.getElementById("lyrics-overlay")?.close();
});

document.addEventListener("keydown", (event) => {
  if (event.key.toLowerCase() !== "b" || (!event.metaKey && !event.ctrlKey) || event.altKey || event.shiftKey) return;
  if (!authShell || authShell.hidden) return;
  event.preventDefault();
  const collapsed = !authShell.classList.contains("sidebar-collapsed");
  setSidebarCollapsed(collapsed);
  localStorage.setItem("orpheus-sidebar-collapsed", String(collapsed));
});

document.addEventListener("keydown", async (event) => {
  if (event.key.toLowerCase() !== "k" || (!event.metaKey && !event.ctrlKey) || event.altKey) return;
  if (!authShell || authShell.hidden) return;
  event.preventDefault();
  if (window.location.pathname !== "/home") {
    await router.go("/home");
  }
  window.dispatchEvent(new CustomEvent("orpheus:focus-track-search"));
});

initAudioPlayer();
initThemeControls();
router.start();
