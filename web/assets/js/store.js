const WORKFLOW_STORAGE_KEY = "orpheus-workflow-draft";
const DRAFTS_STORAGE_KEY = "orpheus-workflow-drafts";

export const appState = new EventTarget();
appState.session = null;

export function setSession(session) {
  appState.session = session;
  appState.dispatchEvent(new CustomEvent("sessionchange", { detail: session }));
}

export function showDialog(message) {
  const dialog = document.getElementById("app-dialog");
  const text = document.getElementById("app-dialog-message");
  if (!dialog || !text) {
    window.alert(message);
    return;
  }
  text.textContent = message;
  dialog.showModal();
}

export function toast(message, tone = "info") {
  const node = document.createElement("div");
  node.className = `toast ${tone}`;
  node.textContent = message;
  document.body.appendChild(node);
  window.setTimeout(() => node.remove(), 3500);
}

export function generateWorkflowId() {
  return `workflow_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

export function createInitialWorkflowState(searchQuery) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  return {
    id: generateWorkflowId(),
    currentStage: "youtube",
    searchQuery,
    selectedVideos: [],
    trackMatches: [],
    lyricsSearchResults: [],
    editedTracks: [],
    timestamp: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
}

export function saveWorkflowState(state) {
  const next = { ...state, timestamp: new Date().toISOString() };
  localStorage.setItem(WORKFLOW_STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent("orpheus:workflowchange", { detail: next }));
}

export function loadWorkflowState() {
  try {
    const raw = localStorage.getItem(WORKFLOW_STORAGE_KEY);
    if (!raw) return null;
    const state = JSON.parse(raw);
    if (!isValidWorkflowState(state) || new Date(state.expiresAt) < new Date()) {
      localStorage.removeItem(WORKFLOW_STORAGE_KEY);
      return null;
    }
    return state;
  } catch {
    localStorage.removeItem(WORKFLOW_STORAGE_KEY);
    return null;
  }
}

export function clearWorkflowState() {
  localStorage.removeItem(WORKFLOW_STORAGE_KEY);
  window.dispatchEvent(new CustomEvent("orpheus:workflowchange"));
}

export function saveNamedDraft(name, state) {
  const drafts = getAllDrafts();
  drafts[name] = { ...state, timestamp: new Date().toISOString() };
  localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(drafts));
}

export function getAllDrafts() {
  try {
    const raw = localStorage.getItem(DRAFTS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    const valid = {};
    for (const [name, draft] of Object.entries(parsed)) {
      if (isValidWorkflowState(draft) && new Date(draft.expiresAt) > new Date()) {
        valid[name] = draft;
      }
    }
    localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(valid));
    return valid;
  } catch {
    localStorage.removeItem(DRAFTS_STORAGE_KEY);
    return {};
  }
}

export function deleteNamedDraft(name) {
  const drafts = getAllDrafts();
  delete drafts[name];
  localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(drafts));
}

export function updateWorkflowStage(state, currentStage) {
  const updated = { ...state, currentStage, timestamp: new Date().toISOString() };
  saveWorkflowState(updated);
  return updated;
}

export function isValidWorkflowState(state) {
  return state &&
    typeof state.id === "string" &&
    typeof state.currentStage === "string" &&
    typeof state.searchQuery === "string" &&
    Array.isArray(state.selectedVideos) &&
    Array.isArray(state.trackMatches) &&
    Array.isArray(state.lyricsSearchResults) &&
    Array.isArray(state.editedTracks) &&
    typeof state.timestamp === "string" &&
    typeof state.expiresAt === "string";
}

export const stageRoutes = {
  search: "/discover",
  youtube: "/discover/youtube",
  spotify: "/discover/spotify",
  lyrics: "/discover/lyrics",
  review: "/discover/review",
  commit: "/discover/review",
};

export const stageOrder = ["search", "youtube", "spotify", "lyrics", "review"];

export const stageLabels = {
  search: "Search",
  youtube: "Find video",
  spotify: "Choose song info",
  lyrics: "Add lyrics",
  review: "Review & save",
  commit: "Save",
};

export function el(tag, options = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(options)) {
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key === "dataset") Object.assign(node.dataset, value);
    else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (value !== false && value != null) node.setAttribute(key, value === true ? "" : String(value));
  }
  for (const child of children) {
    if (child == null) continue;
    node.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return node;
}
