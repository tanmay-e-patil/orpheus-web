# Feature Design Document: Multi-Stage Music Discovery Workflow

## Overview

Transform the current single-step music discovery process into a guided, multi-stage workflow that prioritizes data quality, user control, and progressive enhancement. This new workflow inverts the current Spotify-first approach to start with YouTube discovery, then enriches with Spotify metadata and lyrics.

## Problem Statement

The current workflow has several limitations:

- **Limited user control**: Modal-based selection with minimal editing capabilities
- **Data quality issues**: No validation between different data sources
- **Poor error recovery**: Failures require starting over
- **Inflexible flow**: Spotify-centric approach limits discovery options
- **No draft state**: Progress is lost on browser refresh/navigation

## Solution Architecture

### High-Level Flow

```
Search Input → YouTube Discovery → Spotify Matching → Lyrics Enrichment → Review & Edit → Commit to Library
     ↓              ↓                   ↓                    ↓                  ↓            ↓
   Stage 1        Stage 2           Stage 3              Stage 4           Stage 5      Stage 6
```

## Detailed Stage Breakdown

### Stage 1: Search Input & YouTube Discovery

**Goal**: Find potential music videos based on user search query

**User Interface**:

- Enhanced search input with search suggestions
- Real-time YouTube video results grid
- Video preview functionality
- Multi-select capability for batch processing

**Technical Implementation**:

```typescript
// New action: app/(music-explorer)/discover/actions.ts
export async function discoverYouTubeVideos(
  query: string
): Promise<YouTubeDiscoveryResult[]>;
export async function previewVideoMetadata(
  videoIds: string[]
): Promise<VideoPreview[]>;
```

**Data Flow**:

1. User enters search query
2. Parallel API calls to YouTube Data API (search + video details)
3. Results displayed with confidence scoring
4. User selects videos to proceed with
5. Draft state saved to localStorage

**Key Features**:

- **Smart filtering**: Filter out non-music content using title/channel analysis
- **Batch selection**: Select multiple videos for parallel processing
- **Preview mode**: Quick metadata preview without full processing

### Stage 2: Spotify Metadata Matching

**Goal**: Enrich YouTube videos with structured Spotify metadata

**User Interface**:

- Side-by-side comparison view (YouTube video ↔ Spotify matches)
- Confidence scoring visualization
- Manual override options
- Skip option if no good matches found

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

**Matching Algorithm**:

- Title similarity (70% weight)
- Artist name matching (20% weight)
- Duration proximity (10% weight)
- Release date correlation (bonus points)

### Stage 3: Lyrics Enrichment

**Goal**: Find and select the best lyrics from multiple lrclib.net options with user choice

**User Interface**:

- Multiple lyrics options displayed as cards
- Preview pane showing selected lyrics with sync timing
- Quality indicators (sync availability, accuracy score)
- Manual lyrics input option as fallback
- Side-by-side comparison mode for similar results

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

### Stage 4: Comprehensive Review & Editing

**Goal**: Allow fine-tuning of all metadata before committing

**User Interface**:

- Comprehensive edit form with all fields
- Real-time validation feedback
- Before/after comparison view
- Bulk editing capabilities

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

### Stage 5: Batch Operations & Final Commit

**Goal**: Efficiently process multiple tracks and commit to database

**User Interface**:

- Batch review table with expandable rows
- Select/deselect for final commit
- Progress indicator for database operations
- Success/error feedback per track

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

## State Management Strategy

### Local Storage Draft System

```typescript
type WorkflowState = {
  id: string; // Unique workflow session ID
  currentStage: "youtube" | "spotify" | "lyrics" | "review" | "commit";
  searchQuery: string;
  selectedVideos: YouTubeVideo[];
  spotifyMatches: SpotifyMatchResult[];
  lyricsSearchResults: LyricsSearchResult[]; // Multiple options per track
  editedTracks: EditableTrackData[];
  timestamp: string;
  expiresAt: string; // Auto-cleanup after 7 days
};

// Auto-save every 30 seconds and on stage transitions
const saveWorkflowState = (state: WorkflowState) => {
  const stateWithTimestamp = {
    ...state,
    timestamp: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
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
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  };
  localStorage.setItem("orpheus-workflow-drafts", JSON.stringify(drafts));
};
```

## Error Handling & Recovery

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
```

## Performance Optimizations

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

## File Structure Changes

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

### Enhanced Database Schema

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

### New Type Definitions

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

## Implementation Timeline

### Phase 1 (Week 1-2): Foundation

- [ ] Create new route structure
- [ ] Implement workflow state management
- [ ] Build YouTube discovery stage
- [ ] Add draft recovery system

### Phase 2 (Week 3-4): Core Workflow

- [ ] Implement Spotify matching with confidence scoring
- [ ] Add lyrics integration with lrclib.net
- [ ] Build comprehensive review interface
- [ ] Add validation system

### Phase 3 (Week 5-6): Polish & Optimization

- [ ] Implement batch operations
- [ ] Add performance optimizations
- [ ] Comprehensive error handling
- [ ] User testing and refinement

### Phase 4 (Week 7-8): Migration & Rollout

- [ ] Migrate existing search functionality
- [ ] A/B testing framework
- [ ] Documentation and training
- [ ] Gradual rollout with feature flags

## Success Metrics

- **User Engagement**: Time spent in workflow vs. completion rate
- **Data Quality**: Validation error rate and user edit frequency
- **Performance**: Stage transition time and API response times
- **User Satisfaction**: Survey feedback on new vs. old workflow
- **System Reliability**: Error rate and recovery success rate

## Risk Mitigation

- **API Dependencies**: Implement robust fallback mechanisms
- **Performance Impact**: Load testing with realistic user scenarios
- **User Adoption**: Gradual migration with opt-in period
- **Data Integrity**: Comprehensive validation and rollback capabilities
- **Browser Compatibility**: Cross-browser testing for state management

This design provides a comprehensive foundation for implementing the multi-stage workflow while maintaining high data quality and user control throughout the process.
