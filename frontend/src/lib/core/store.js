const WORKFLOW_STORAGE_KEY = 'orpheus-workflow-draft';
const DRAFTS_STORAGE_KEY = 'orpheus-workflow-drafts';

export const appState = new EventTarget();
appState.session = null;

export function setSession(session) {
  appState.session = session;
  appState.dispatchEvent(new CustomEvent('sessionchange', { detail: session }));
}

export function showDialog(message) {
  toast(message, 'error');
}

export function toast(message, tone = 'info') {
  window.dispatchEvent(
    new CustomEvent('orpheus:notice', { detail: { message, tone } }),
  );
}

export function generateWorkflowId() {
  return `workflow_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

/** @returns {import('../types').Workflow} */
export function createInitialWorkflowState(searchQuery) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  return {
    id: generateWorkflowId(),
    currentStage: 'youtube',
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
  window.dispatchEvent(
    new CustomEvent('orpheus:workflowchange', { detail: next }),
  );
}

/** @returns {import('../types').Workflow | null} */
export function loadWorkflowState() {
  try {
    const raw = localStorage.getItem(WORKFLOW_STORAGE_KEY);
    if (!raw) return null;
    const state = JSON.parse(raw);
    if (
      !isValidWorkflowState(state) ||
      new Date(state.expiresAt) < new Date()
    ) {
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
  window.dispatchEvent(new CustomEvent('orpheus:workflowchange'));
}

export function saveNamedDraft(name, state) {
  const drafts = getAllDrafts();
  drafts[name] = { ...state, timestamp: new Date().toISOString() };
  localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(drafts));
}

/** @returns {Record<string, import('../types').Workflow>} */
export function getAllDrafts() {
  try {
    const raw = localStorage.getItem(DRAFTS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    const valid = {};
    for (const [name, draft] of Object.entries(parsed)) {
      if (
        isValidWorkflowState(draft) &&
        new Date(draft.expiresAt) > new Date()
      ) {
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
  const updated = {
    ...state,
    currentStage,
    timestamp: new Date().toISOString(),
  };
  saveWorkflowState(updated);
  return updated;
}

export function isValidWorkflowState(state) {
  return (
    state &&
    typeof state.id === 'string' &&
    typeof state.currentStage === 'string' &&
    typeof state.searchQuery === 'string' &&
    Array.isArray(state.selectedVideos) &&
    Array.isArray(state.trackMatches) &&
    Array.isArray(state.lyricsSearchResults) &&
    Array.isArray(state.editedTracks) &&
    typeof state.timestamp === 'string' &&
    typeof state.expiresAt === 'string'
  );
}

export const stageRoutes = {
  search: '/discover',
  youtube: '/discover/youtube',
  spotify: '/discover/spotify',
  lyrics: '/discover/lyrics',
  review: '/discover/review',
  commit: '/discover/review',
};

export const stageOrder = ['search', 'youtube', 'spotify', 'lyrics', 'review'];

export const stageLabels = {
  search: 'Search',
  youtube: 'Find video',
  spotify: 'Choose song info',
  lyrics: 'Add lyrics',
  review: 'Review & save',
  commit: 'Save',
};
