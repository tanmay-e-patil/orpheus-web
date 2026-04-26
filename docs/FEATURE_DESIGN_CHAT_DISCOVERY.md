# Feature Design: Chat-Style Music Discovery

## Problem

Current discovery workflow has 6 stages across 6 page navigations:
`search → youtube → spotify → lyrics → review → commit`

User research shows:
- 99.99% of usage is single-song addition
- Batch operations negligible (<0.01%)
- Too many clicks/navigations to get one song saved

## Solution: Chat-Style Discovery Workflow

Replace multi-stage navigation with a single-screen conversational interface. The agent runs pipeline stages in the background and surfaces results inline as message cards with action buttons.

## User Flow

```
User: "add bohemian rhapsody"

Bot:  Found 3 YouTube matches — picking best or choose:
      [Card: Bohemian Rhapsody · Queen · 5:55 · 94% match]
      [Card: Bohemian Rhapsody Live · Queen · 6:32 · 71% match]
      [Card: Bohemian Rhapsody Cover · ... · 4:51 · 43% match]

User: [clicks "Use this" on top result]

Bot:  Matched to Spotify →
      [Card: Queen · Bohemian Rhapsody · A Night at the Opera · 1975]
      Lyrics found (synced) ✓
      [Save to Library]  [Edit metadata]

User: [clicks Save to Library]

Bot:  Done. Bohemian Rhapsody added to library.
```

If agent is uncertain (confidence < 70%), it interrupts and asks instead of auto-picking.

### Recovery via natural language

```
User: "wrong artist"
Bot:  Re-matching... [new results]

User: "use the live version instead"
Bot:  Switched to live version. [updated card]
```

## Architecture

### New components

- `ChatDiscovery` — root page component, replaces `/discover` multi-page flow
- `ChatThread` — message list, auto-scrolls
- `ChatInput` — text input + send button
- `BotMessage` — wrapper for agent response bubbles
- `YouTubeResultCard` — inline video card with thumbnail, confidence badge, action buttons
- `SpotifyMatchCard` — album art, track metadata, match score
- `MetadataDrawer` — slide-out sheet containing existing `ReviewAndEdit` form (reused)

### Pipeline orchestration

Single server action `runDiscoveryAgent(query, context)` replaces per-stage actions:
1. YouTube search → return top results
2. On user selection → Spotify match + lyrics fetch **in parallel**
3. On confirm → commit to library

Agent only interrupts user when confidence < threshold. Otherwise auto-advances and notifies inline.

### State

Chat history IS the state. No localStorage workflow state machine needed. Each message carries enough context for the next step. Existing `WorkflowState` type can be dropped once migrated.

## What Gets Reused

| Existing piece | Reuse as |
|---|---|
| `discoverYouTubeVideos` action | unchanged |
| `SpotifyMatching` component | inner content of `SpotifyMatchCard` |
| `LyricsEnrichment` component | shown in `MetadataDrawer` |
| `ReviewAndEdit` form | `MetadataDrawer` content |
| `CommitToLibrary` action | called on final confirm |

## Trade-offs

**Wins:**
- 6 navigations → 0. One screen.
- Agent handles happy path silently. User only sees choices when needed.
- Natural error recovery via text ("try another", "wrong match")
- Mobile-native UX pattern
- No complex state persistence — chat history suffices

**Limitations:**
- Synced lyrics preview and metadata edit still need panel surface (solved via `MetadataDrawer`)
- No URL-shareable session state (acceptable for internal tool)
- Power users lose granular per-stage control (low priority given usage data)

## Confidence Thresholds

| Score | Behavior |
|---|---|
| ≥ 70% | Auto-select, notify user inline |
| 50–69% | Show top 3 options, ask user to pick |
| < 50% | Ask user to clarify query |

## Open Questions

- Should chat history persist across sessions (re-open app, see last addition)?
- Keyboard shortcut to open discovery from anywhere in the app?
- Voice input for mobile ("add [song name]")?
