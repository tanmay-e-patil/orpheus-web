import type { Workflow } from '../types';

const WORKFLOW_STORAGE_KEY = 'orpheus-workflow-draft';
const DRAFTS_STORAGE_KEY = 'orpheus-workflow-drafts';

// localStorage is the source of truth. Bumping this after each write makes the
// reactive `workflows` getters below re-read it.
let revision = $state(0);

/** Reactive view of the active workflow and named drafts. */
export const workflows = {
  get active() {
    void revision;
    return loadWorkflowState();
  },
  get drafts() {
    void revision;
    return getAllDrafts();
  },
};

export function generateWorkflowId() {
  return `workflow_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

export function createInitialWorkflowState(searchQuery: string): Workflow {
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

export function saveWorkflowState(state: Workflow) {
  const next = { ...state, timestamp: new Date().toISOString() };
  localStorage.setItem(WORKFLOW_STORAGE_KEY, JSON.stringify(next));
  revision++;
}

export function loadWorkflowState(): Workflow | null {
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
  revision++;
}

export function saveNamedDraft(name: string, state: Workflow) {
  const drafts = getAllDrafts();
  drafts[name] = { ...state, timestamp: new Date().toISOString() };
  localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(drafts));
  revision++;
}

export function getAllDrafts(): Record<string, Workflow> {
  try {
    const raw = localStorage.getItem(DRAFTS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    const valid: Record<string, Workflow> = {};
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

export function deleteNamedDraft(name: string) {
  const drafts = getAllDrafts();
  delete drafts[name];
  localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(drafts));
  revision++;
}

export function isValidWorkflowState(state: unknown): state is Workflow {
  if (!state || typeof state !== 'object') return false;
  const candidate = state as Record<string, unknown>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.currentStage === 'string' &&
    typeof candidate.searchQuery === 'string' &&
    Array.isArray(candidate.selectedVideos) &&
    Array.isArray(candidate.trackMatches) &&
    Array.isArray(candidate.lyricsSearchResults) &&
    Array.isArray(candidate.editedTracks) &&
    typeof candidate.timestamp === 'string' &&
    typeof candidate.expiresAt === 'string'
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
