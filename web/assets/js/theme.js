export const DEFAULT_THEME = "catppuccin-mocha";
export const THEME_STORAGE_KEY = "orpheus-theme";

export const THEMES = [
  { id: "catppuccin-mocha", label: "Catppuccin Mocha", themeColor: "#1e1e2e" },
  { id: "dracula", label: "Dracula", themeColor: "#282a36" },
  { id: "tokyo-night", label: "Tokyo Night", themeColor: "#1a1b26" },
  { id: "gruvbox-dark", label: "Gruvbox Dark", themeColor: "#282828" },
  { id: "nord", label: "Nord", themeColor: "#2e3440" },
  { id: "solarized-light", label: "Solarized Light", themeColor: "#fdf6e3" },
];

const themeIds = new Set(THEMES.map((theme) => theme.id));

export function getStoredTheme() {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  return themeIds.has(stored) ? stored : DEFAULT_THEME;
}

export function applyTheme(themeId) {
  const nextTheme = THEMES.find((theme) => theme.id === themeId) || THEMES.find((theme) => theme.id === DEFAULT_THEME);
  document.documentElement.dataset.theme = nextTheme.id;
  localStorage.setItem(THEME_STORAGE_KEY, nextTheme.id);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", nextTheme.themeColor);
  document.querySelectorAll("[data-theme-select]").forEach((select) => {
    select.value = nextTheme.id;
  });
}

export function initThemeControls() {
  const selects = document.querySelectorAll("[data-theme-select]");
  for (const select of selects) {
    select.replaceChildren(...THEMES.map((theme) => {
      const option = document.createElement("option");
      option.value = theme.id;
      option.textContent = theme.label;
      return option;
    }));
    select.addEventListener("change", () => applyTheme(select.value));
  }
  applyTheme(getStoredTheme());
}
