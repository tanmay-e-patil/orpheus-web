"use client";

import { WorkflowState, WorkflowStage } from "@/types/workflow";

const WORKFLOW_STORAGE_KEY = "orpheus-workflow-draft";
const DRAFTS_STORAGE_KEY = "orpheus-workflow-drafts";

// Generate unique workflow ID
export const generateWorkflowId = (): string => {
  return `workflow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

// Create initial workflow state
export const createInitialWorkflowState = (
  searchQuery: string
): WorkflowState => {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days

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
};

// Save workflow state to localStorage
export const saveWorkflowState = (state: WorkflowState): void => {
  if (typeof window === "undefined") return;

  const stateWithTimestamp = {
    ...state,
    timestamp: new Date().toISOString(),
  };

  try {
    localStorage.setItem(
      WORKFLOW_STORAGE_KEY,
      JSON.stringify(stateWithTimestamp)
    );
  } catch (error) {
    console.error("Failed to save workflow state:", error);
  }
};

// Load workflow state from localStorage
export const loadWorkflowState = (): WorkflowState | null => {
  if (typeof window === "undefined") return null;

  try {
    const saved = localStorage.getItem(WORKFLOW_STORAGE_KEY);
    if (!saved) return null;

    const state = JSON.parse(saved) as WorkflowState;

    // Check if draft has expired
    if (new Date(state.expiresAt) < new Date()) {
      localStorage.removeItem(WORKFLOW_STORAGE_KEY);
      return null;
    }

    // Validate state structure
    return isValidWorkflowState(state) ? state : null;
  } catch (error) {
    console.error("Failed to load workflow state:", error);
    localStorage.removeItem(WORKFLOW_STORAGE_KEY);
    return null;
  }
};

// Clear current workflow state
export const clearWorkflowState = (): void => {
  if (typeof window === "undefined") return;
  localStorage.removeItem(WORKFLOW_STORAGE_KEY);
};

// Save named draft
export const saveNamedDraft = (name: string, state: WorkflowState): void => {
  if (typeof window === "undefined") return;

  try {
    const drafts = getAllDrafts();
    drafts[name] = {
      ...state,
      timestamp: new Date().toISOString(),
    };
    localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(drafts));
  } catch (error) {
    console.error("Failed to save named draft:", error);
  }
};

// Get all saved draft sessions
export const getAllDrafts = (): Record<string, WorkflowState> => {
  if (typeof window === "undefined") return {};

  try {
    const drafts = localStorage.getItem(DRAFTS_STORAGE_KEY);
    if (!drafts) return {};

    const parsedDrafts = JSON.parse(drafts) as Record<string, WorkflowState>;

    // Clean up expired drafts
    const validDrafts: Record<string, WorkflowState> = {};
    Object.entries(parsedDrafts).forEach(([name, draft]) => {
      if (new Date(draft.expiresAt) > new Date()) {
        validDrafts[name] = draft;
      }
    });

    // Save cleaned drafts back
    localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(validDrafts));
    return validDrafts;
  } catch (error) {
    console.error("Failed to load drafts:", error);
    localStorage.removeItem(DRAFTS_STORAGE_KEY);
    return {};
  }
};

// Delete a named draft
export const deleteNamedDraft = (name: string): void => {
  if (typeof window === "undefined") return;

  try {
    const drafts = getAllDrafts();
    delete drafts[name];
    localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(drafts));
  } catch (error) {
    console.error("Failed to delete named draft:", error);
  }
};

// State validation helper
export const isValidWorkflowState = (state: any): state is WorkflowState => {
  return (
    typeof state === "object" &&
    typeof state.id === "string" &&
    typeof state.currentStage === "string" &&
    typeof state.searchQuery === "string" &&
    Array.isArray(state.selectedVideos) &&
    Array.isArray(state.trackMatches) &&
    Array.isArray(state.lyricsSearchResults) &&
    Array.isArray(state.editedTracks) &&
    typeof state.timestamp === "string" &&
    typeof state.expiresAt === "string"
  );
};

// Update workflow stage
export const updateWorkflowStage = (
  state: WorkflowState,
  newStage: WorkflowStage
): WorkflowState => {
  const updatedState = {
    ...state,
    currentStage: newStage,
    timestamp: new Date().toISOString(),
  };

  saveWorkflowState(updatedState);
  return updatedState;
};

// Get stage progress (for progress bar)
export const getStageProgress = (currentStage: WorkflowStage): number => {
  const stages: WorkflowStage[] = [
    "search",
    "youtube",
    "spotify",
    "lyrics",
    "review",
    "commit",
  ];
  const currentIndex = stages.indexOf(currentStage);
  return currentIndex >= 0 ? ((currentIndex + 1) / stages.length) * 100 : 0;
};

// Get next stage
export const getNextStage = (
  currentStage: WorkflowStage
): WorkflowStage | null => {
  const stageOrder: WorkflowStage[] = [
    "search",
    "youtube",
    "spotify",
    "lyrics",
    "review",
    "commit",
  ];
  const currentIndex = stageOrder.indexOf(currentStage);
  return currentIndex >= 0 && currentIndex < stageOrder.length - 1
    ? stageOrder[currentIndex + 1]
    : null;
};

// Get previous stage
export const getPreviousStage = (
  currentStage: WorkflowStage
): WorkflowStage | null => {
  const stageOrder: WorkflowStage[] = [
    "search",
    "youtube",
    "spotify",
    "lyrics",
    "review",
    "commit",
  ];
  const currentIndex = stageOrder.indexOf(currentStage);
  return currentIndex > 0 ? stageOrder[currentIndex - 1] : null;
};
