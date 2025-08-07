# Feature Design Document: Multi-Stage Music Discovery Workflow (Updated Implementation Status)

## Overview

The multi-stage workflow has been partially implemented. Users now progress through a guided sequence beginning with YouTube discovery, then optional Spotify metadata matching, lyrics enrichment, review/edit, and final commit. This document reflects the CURRENT STATE of what is implemented vs. the original design intent, and outlines gaps & next steps.

## Problem Statement

The current workflow has several limitations:

- **Limited user control**: Modal-based selection with minimal editing capabilities
- **Data quality issues**: No validation between different data sources
- **Poor error recovery**: Failures require starting over
- **Inflexible flow**: Spotify-centric approach limits discovery options
- **No draft state**: Progress is lost on browser refresh/navigation

## Solution Architecture

## High-Level Flow (as implemented)

```
Landing/Search → (Stage 1) YouTube Discovery → (Stage 2) Spotify Matching → (Stage 3) Lyrics Enrichment → (Stage 4) Review & Edit → (Stage 5) Commit
```

Notes:

- Original spec listed 6 stages starting at "Search Input" — current implementation folds search into the landing and jumps workflow state directly to `youtube` after initiating discovery.
- Internal `WorkflowStage` enum still includes `search`, but no dedicated `/discover/search` route exists yet.

## Detailed Stage Breakdown

### Stage 1: YouTube Discovery (Implemented)

Goal: Find potential music videos based on user search query.

Implemented UI:

- Search input (no autocomplete/suggestions yet)
- Result grid with: thumbnail, duration, view count, channel, confidence score
- Multi-select with visual selection state & Select All / Deselect All
- Inline video preview via modal (YouTube embed)

Implemented Backend (`discoverYouTubeVideos`):

```ts
export async function discoverYouTubeVideos(
  query: string
): Promise<YouTubeDiscoveryResult[]>;
```

Enhancements vs spec:

- Confidence uses heuristic scoring (keywords + channel + duration window)
- Combined search + details (two API calls as designed)

Not Yet Implemented (from original spec):

- Search suggestions / typeahead
- Separate `previewVideoMetadata` action
- Explicit music content filtering beyond heuristic (no ML layer)
- Result filtering controls (duration/channel filters)

State Persistence:

- Results & selection stored in `WorkflowState.selectedVideos` (with `selected` flag)
- LocalStorage persistence via `saveWorkflowState()`

### Stage 2: Spotify Metadata Matching (Implemented MVP)

**Goal**: Enrich YouTube videos with structured Spotify metadata

Implemented UI:

- Per-video card listing top (up to 5) Spotify matches
- Automatic pre-selection of top match
- Confidence badge (high/medium/low/none)
- Ability to select alternative match among top 3 listed (extra matches count hint if >3)
- Skip (unset selection)

Not Yet Implemented:

- Side-by-side structured diff layout
- Manual free-form match entry
- Batch operations / bulk skip
- Pagination or “view more” expansion logic (placeholder button only)

**Technical Implementation**:

```typescript
// Enhanced Spotify matching with confidence scoring
export async function findSpotifyMatches(
  youtubeVideos: YouTubeVideo[]
): Promise<SpotifyMatchResult[]>;

type SpotifyMatchResult = {
  youtubeVideo: YouTubeVideo;
  spotifyMatches: SpotifyTrack[];
  confidence: "high" | "medium" | "low" | "none";
  selectedMatch?: SpotifyTrack;
};
```

**Data Flow**:

1. For each selected YouTube video, search Spotify API
2. Use fuzzy matching algorithm to score potential matches
3. Present top matches with confidence indicators
4. User can manually select different matches or skip
5. Progress saved to draft state

Matching Logic (current):

- Title similarity (Levenshtein-derived) 70%
- Artist name containment 20%
- Duration proximity (if available) 10%
- No explicit release date bonus yet

### Stage 3: Lyrics Enrichment (Implemented MVP)

**Goal**: Find and select the best lyrics from multiple lrclib.net options with user choice

Implemented UI:

- Track-level cards with status (found/partial/none)
- Up to first 3 lyrics options (confidence badge, sync indicator, truncated preview)
- Selection & skip handling
- Tabs to view plain vs synced lyrics for the selected option

Not Yet Implemented:

- Manual lyrics input
- Side-by-side comparison of options
- Viewing additional (>3) options (button placeholder only)
- Sync timing visualization UI

**Technical Implementation**:

```typescript
export async function fetchLyricsOptions(
  trackInfo: SpotifyTrack
): Promise<LyricsSearchResult>;

type LyricsOption = {
  id: number;
  trackName: string;
  artistName: string;
  albumName?: string;
  duration?: number;
  plainLyrics?: string;
  syncedLyrics?: string; // LRC format
  source: "lrclib" | "manual";
  confidence: number; // 0-100 based on metadata match
  hasSync: boolean;
};

type LyricsSearchResult = {
  query: {
    track: string;
    artist: string;
    album?: string;
    duration?: number;
  };
  options: LyricsOption[];
  selectedOption?: LyricsOption;
  status: "found" | "partial" | "none";
};

// Enhanced API integration with multiple results
export async function searchLrcLib(
  track: string,
  artist: string,
  album?: string,
  duration?: number
): Promise<LyricsOption[]> {
  const searches = [
    // Exact match
    { track_name: track, artist_name: artist, album_name: album, duration },
    // Without album
    { track_name: track, artist_name: artist },
    // Fuzzy match (remove special characters)
    { track_name: cleanString(track), artist_name: cleanString(artist) },
  ];

  const allResults: LyricsOption[] = [];

  for (const searchParams of searches) {
    const results = await queryLrcLibAPI(searchParams);
    allResults.push(
      ...results.map((r) => ({
        ...r,
        confidence: calculateMatchConfidence(r, {
          track,
          artist,
          album,
          duration,
        }),
      }))
    );
  }

  // Deduplicate and sort by confidence
  return deduplicateAndSort(allResults);
}

// Calculate match confidence based on metadata similarity
const calculateMatchConfidence = (
  result: any,
  original: { track: string; artist: string; album?: string; duration?: number }
): number => {
  let score = 0;

  // Track name similarity (40% weight)
  score += stringSimilarity(result.trackName, original.track) * 0.4;

  // Artist name similarity (30% weight)
  score += stringSimilarity(result.artistName, original.artist) * 0.3;

  // Album match (15% weight)
  if (original.album && result.albumName) {
    score += stringSimilarity(result.albumName, original.album) * 0.15;
  }

  // Duration proximity (10% weight)
  if (original.duration && result.duration) {
    const durationDiff = Math.abs(original.duration - result.duration);
    const durationScore = Math.max(0, 1 - durationDiff / 30); // 30 second tolerance
    score += durationScore * 0.1;
  }

  // Sync availability bonus (5% weight)
  if (result.syncedLyrics) {
    score += 0.05;
  }

  return Math.round(score * 100);
};
```

**Data Flow**:

1. Search lrclib.net with multiple query variations (exact, fuzzy, partial)
2. Calculate confidence scores for each result based on metadata matching
3. Display options in order of confidence with quality indicators
4. User selects preferred option or chooses "No lyrics" / "Manual input"
5. Preview selected lyrics with sync timing visualization
6. Allow editing of selected lyrics before proceeding
7. Validate lyrics format (LRC syntax for synced lyrics)

### Stage 4: Review & Edit (Implemented Basic Editor)

**Goal**: Allow fine-tuning of all metadata before committing

Implemented UI:

- Per-track card with toggle between read-only summary and tabbed edit form (Basic Info / Sources / Lyrics)
- Basic validation (required fields, simple URL check, duration mismatch warning)
- Inline errors & warnings display

Not Yet Implemented:

- Before/after comparison view
- Bulk edits across tracks
- Tag management UI (customTags exists but no editor)
- Duration normalization (Spotify vs YouTube) – currently placeholder values
- Personal rating input

**Key Editable Fields**:

```typescript
type EditableTrackData = {
  // YouTube metadata
  youtubeTitle: string;
  youtubeChannel: string;
  youtubeDuration: string;

  // Spotify metadata
  trackName: string;
  artistName: string;
  albumName: string;
  albumArt: string;
  releaseDate: string;
  spotifyDuration: string;

  // Lyrics data
  lyrics: string;
  syncedLyrics?: string;

  // User overrides
  customTags: string[];
  personalRating?: number;
};
```

**Validation Rules**:

- Duration consistency between YouTube and Spotify (±10% tolerance)
- Artist name similarity validation
- Album art URL validation
- Lyrics format validation (LRC format for synced)

### Stage 5: Commit (Implemented Basic Batch Save)

**Goal**: Efficiently process multiple tracks and commit to database

Implemented UI:

- Pre-commit summary list (all tracks assumed selected)
- Incremental progress list while committing
- Final summary with success/failure counts & retry failed button
- Workflow completion CTA (Go to Library / Start New)

Not Yet Implemented:

- Select/deselect subset for commit
- True database transaction rollback semantics (calls existing `saveSongAndVideo` sequentially)
- Background job queuing (not visible here)
- Partial retry of only failed items (current retry re-runs full loop logic placeholder)

**Technical Implementation**:

```typescript
export async function commitTracksToLibrary(
  tracks: ProcessedTrack[]
): Promise<CommitResult[]>;

// Enhanced database transaction with rollback capability
export async function batchUpsertTracks(
  tracks: ProcessedTrack[]
): Promise<void>;
```

**Database Operations**:

1. Begin database transaction
2. Upsert YouTube video data
3. Upsert Spotify track data with lyrics
4. Create user library associations
5. Queue background processing jobs
6. Commit transaction or rollback on error

## State Management Strategy (Implemented)

### Local Storage Draft System

Implemented type (see `types/workflow.ts`):

```ts
export type WorkflowState = {
  id: string;
  currentStage: WorkflowStage; // includes 'search' though no dedicated route yet
  searchQuery: string;
  selectedVideos: YouTubeDiscoveryResult[]; // includes confidence & selected
  spotifyMatches: SpotifyMatchResult[];
  lyricsSearchResults: LyricsSearchResult[];
  editedTracks: EditableTrackData[];
  timestamp: string;
  expiresAt: string;
};
```

Enhancements vs original draft:

- `selectedVideos` stores selection inline (no separate structure)
- Lyrics result stores `trackId` for join
- Confidence scoring integrated across YouTube, Spotify, Lyrics
  // Auto-save every 30 seconds and on stage transitions
  const saveWorkflowState = (state: WorkflowState) => {
  const stateWithTimestamp = {
  ...state,
  timestamp: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 7 _ 24 _ 60 _ 60 _ 1000).toISOString(),
  };
  localStorage.setItem(
  "orpheus-workflow-draft",
  JSON.stringify(stateWithTimestamp)
  );
  };

// Support multiple draft sessions
const saveNamedDraft = (name: string, state: WorkflowState) => {
const drafts = getAllDrafts();
drafts[name] = {
...state,
timestamp: new Date().toISOString(),
expiresAt: new Date(Date.now() + 7 _ 24 _ 60 _ 60 _ 1000).toISOString(),
};
localStorage.setItem("orpheus-workflow-drafts", JSON.stringify(drafts));
};

````

## Error Handling & Recovery (Current Behavior)

Implemented:
- Try/catch in server actions with console logging
- LocalStorage recovery on page load for each stage
- Draft persistence + multiple named drafts (landing page UI to load/delete)

Not Implemented Yet:
- Explicit exponential backoff & retry strategies
- UI-level toast notifications for failures (commented as TODO)
- Expiration cleanup job beyond lazy load pruning
- Validation gating in earlier stages (only at review stage)

### Graceful Degradation

- **API failures**: Show cached results or allow manual input
- **Rate limiting**: Queue requests and show progress
- **Network issues**: Retry with exponential backoff
- **Validation errors**: Highlight issues without blocking progress

### Recovery Mechanisms

```typescript
// Auto-recovery from saved state
const recoverWorkflowState = (): WorkflowState | null => {
  try {
    const saved = localStorage.getItem("orpheus-workflow-draft");
    if (saved) {
      const state = JSON.parse(saved) as WorkflowState;

      // Check if draft has expired
      if (new Date(state.expiresAt) < new Date()) {
        localStorage.removeItem("orpheus-workflow-draft");
        return null;
      }

      // Validate state structure
      return isValidWorkflowState(state) ? state : null;
    }
  } catch (error) {
    console.error("Failed to recover workflow state:", error);
    // Clean up corrupted state
    localStorage.removeItem("orpheus-workflow-draft");
  }
  return null;
};

// Get all saved draft sessions
const getAllDrafts = (): Record<string, WorkflowState> => {
  try {
    const drafts = localStorage.getItem("orpheus-workflow-drafts");
    if (drafts) {
      const parsedDrafts = JSON.parse(drafts) as Record<string, WorkflowState>;

      // Clean up expired drafts
      const validDrafts: Record<string, WorkflowState> = {};
      Object.entries(parsedDrafts).forEach(([name, draft]) => {
        if (new Date(draft.expiresAt) > new Date()) {
          validDrafts[name] = draft;
        }
      });

      // Save cleaned drafts back
      localStorage.setItem(
        "orpheus-workflow-drafts",
        JSON.stringify(validDrafts)
      );
      return validDrafts;
    }
  } catch (error) {
    console.error("Failed to load drafts:", error);
    localStorage.removeItem("orpheus-workflow-drafts");
  }
  return {};
};

// State validation helper
const isValidWorkflowState = (state: any): state is WorkflowState => {
  return (
    typeof state === "object" &&
    typeof state.id === "string" &&
    typeof state.currentStage === "string" &&
    typeof state.searchQuery === "string" &&
    Array.isArray(state.selectedVideos) &&
    Array.isArray(state.spotifyMatches) &&
    Array.isArray(state.lyricsSearchResults) &&
    Array.isArray(state.editedTracks) &&
    typeof state.timestamp === "string" &&
    typeof state.expiresAt === "string"
  );
};
````

## Performance & Optimization Status

Current implementation:

- Sequential network calls per stage (no batching yet)
- Simple heuristic filtering & matching (no ML, no caching)

Planned (not yet implemented):

- Redis / cache layer
- Parallel Spotify searches with rate limit handling queue
- Background prefetch of next stage data
- Virtualization for large result sets

### API Efficiency

- **Batch requests**: Combine multiple API calls where possible
- **Caching layer**: Redis cache for frequently accessed data
- **Rate limit handling**: Intelligent queuing and retry logic
- **Parallel processing**: Process multiple tracks simultaneously

### UI Responsiveness

- **Lazy loading**: Load stage data only when accessed
- **Optimistic updates**: Show immediate feedback before API responses
- **Background prefetching**: Preload next stage data
- **Virtual scrolling**: Handle large result sets efficiently

## File Structure (Current vs Planned)

### New Route Structure

```
app/(music-explorer)/
├── discover/
│   ├── page.tsx                 # Landing/search page
│   ├── youtube/
│   │   ├── page.tsx            # Stage 1: YouTube discovery
│   │   └── _components/
│   │       ├── VideoGrid.tsx
│   │       ├── VideoPreview.tsx
│   │       └── BatchSelector.tsx
│   ├── spotify/
│   │   ├── page.tsx            # Stage 2: Spotify matching
│   │   └── _components/
│   │       ├── MatchComparison.tsx
│   │       ├── ConfidenceIndicator.tsx
│   │       └── ManualMatch.tsx
│   ├── lyrics/
│   │   ├── page.tsx            # Stage 3: Lyrics enrichment
│   │   └── _components/
│   │       ├── LyricsOptionsGrid.tsx
│   │       ├── LyricsOptionCard.tsx
│   │       ├── LyricsPreview.tsx
│   │       ├── ConfidenceIndicator.tsx
│   │       ├── SyncTimingViewer.tsx
│   │       ├── ManualLyricsInput.tsx
│   │       └── LyricsComparison.tsx
│   ├── review/
│   │   ├── page.tsx            # Stage 4: Review & edit
│   │   └── _components/
│   │       ├── EditableTrackCard.tsx
│   │       ├── ValidationFeedback.tsx
│   │       └── BulkEditPanel.tsx
│   ├── commit/
│   │   ├── page.tsx            # Stage 5: Final commit
│   │   └── _components/
│   │       ├── CommitProgress.tsx
│   │       ├── SuccessConfirmation.tsx
│   │       └── ErrorRecovery.tsx
│   ├── actions.ts              # All workflow actions
│   └── _components/
│       ├── WorkflowProgress.tsx
│       ├── StateRecovery.tsx
│       └── DraftManager.tsx
```

### Database Schema / Persistence

Current code reuses existing song/video persistence via `saveSongAndVideo` (from search actions). No dedicated `workflow_sessions` table or schema extensions (e.g., discoverySource, matchConfidence, lyricsSource) are implemented yet.

Planned (not implemented):

- `workflow_sessions` table
- Extended songs table fields: discoverySource, matchConfidence, userEdited, customTags, personalRating, lyricsSource, syncedLyrics

```typescript
// Add workflow tracking table
export const workflowSessionsTable = pgTable("workflow_sessions", {
  id: text("id").notNull().primaryKey(),
  userId: text("user_id").references(() => user.id),
  currentStage: text("current_stage").notNull(),
  searchQuery: text("search_query"),
  stateData: json("state_data"), // Serialized workflow state
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Enhanced songs table with additional metadata
export const songsTableV2 = pgTable("songs", {
  // ... existing fields ...

  // New fields for enhanced workflow
  discoverySource: text("discovery_source").notNull().default("youtube"), // youtube, spotify, manual
  matchConfidence: text("match_confidence"), // high, medium, low
  userEdited: boolean("user_edited").default(false),
  customTags: json("custom_tags"), // Array of user tags
  personalRating: integer("personal_rating"), // 1-5 stars
  lyricsSource: text("lyrics_source"), // lrclib, manual, none
  syncedLyrics: text("synced_lyrics"), // LRC format lyrics
});
```

### Type Definitions (Implemented Subset)

Implemented (`types/workflow.ts`): `WorkflowStage`, `YouTubeDiscoveryResult`, `SpotifyMatchResult`, `LyricsOption`, `LyricsSearchResult`, `EditableTrackData`, `ValidationResult`, `ProcessedTrack`, `CommitResult`.

Differences:

- `ProcessedTrack` used only transiently in review stage (not persisted)
- `userEdits` partial modifications applied; no diff structure maintained

```typescript
// types/workflow.ts
export type WorkflowStage =
  | "search"
  | "youtube"
  | "spotify"
  | "lyrics"
  | "review"
  | "commit";

export type YouTubeDiscoveryResult = YouTubeVideo & {
  confidence: number;
  musicProbability: number; // AI-scored likelihood it's music content
};

export type SpotifyMatchResult = {
  youtubeVideo: YouTubeVideo;
  spotifyMatches: (SpotifyTrack & { matchScore: number })[];
  selectedMatch?: SpotifyTrack;
  confidence: "high" | "medium" | "low" | "none";
};

export type ProcessedTrack = {
  youtube: YouTubeVideo;
  spotify?: SpotifyTrack;
  lyrics?: LyricsResult;
  userEdits: Partial<EditableTrackData>;
  validationStatus: ValidationResult;
};
```

## Current Completion Snapshot

| Area                               | Status                                                  |
| ---------------------------------- | ------------------------------------------------------- |
| YouTube Discovery                  | Implemented (heuristic scoring, selection, preview)     |
| Spotify Matching                   | Implemented (basic scoring & selection)                 |
| Lyrics Enrichment                  | Implemented (top options, selection, sync preview tabs) |
| Review & Edit                      | Implemented (basic per-track editor + validation)       |
| Commit                             | Implemented (sequential save + progress feedback)       |
| Workflow Persistence               | Implemented (localStorage + named drafts)               |
| Advanced Filtering/Batch Ops       | Not implemented                                         |
| Manual Overrides (lyrics/match)    | Partial (match select only)                             |
| Bulk Editing                       | Not implemented                                         |
| Database Workflow Session Tracking | Not implemented                                         |
| Extended Schema Fields             | Not implemented                                         |
| Retry/Backoff Logic                | Not implemented                                         |
| Caching / Performance Layer        | Not implemented                                         |

## Prioritized Next Steps

1. Persist workflow sessions server-side (enable cross-device recovery)
2. Add manual lyrics input + extended option expansion
3. Implement batch commit selection & partial retries
4. Bulk editing tools (tags, ratings, shared edits)
5. Enhance validation (duration tolerance, artist similarity scoring feedback)
6. Introduce caching & parallelization for Spotify & lyrics lookups
7. Extend DB schema (discoverySource, confidence persistence, lyricsSource)
8. Replace alert() with toast-based UX and structured error surfaces
9. Add search suggestions / query assist
10. Implement prefetch for next stage to reduce perceived latency

## Success Metrics (Planned – Not Yet Instrumented)

- **User Engagement**: Time spent in workflow vs. completion rate
- **Data Quality**: Validation error rate and user edit frequency
- **Performance**: Stage transition time and API response times
- **User Satisfaction**: Survey feedback on new vs. old workflow
- **System Reliability**: Error rate and recovery success rate

## Risk Mitigation (Revisited)

Current mitigations are minimal; most sophisticated strategies remain to be implemented. Emphasis should shift to adding structured error surfaces and persistence beyond the browser.

---

This updated document should guide future incremental improvements while accurately reflecting the existing baseline.

- **API Dependencies**: Implement robust fallback mechanisms
- **Performance Impact**: Load testing with realistic user scenarios
- **User Adoption**: Gradual migration with opt-in period
- **Data Integrity**: Comprehensive validation and rollback capabilities
- **Browser Compatibility**: Cross-browser testing for state management

This design provides a comprehensive foundation for implementing the multi-stage workflow while maintaining high data quality and user control throughout the process.
