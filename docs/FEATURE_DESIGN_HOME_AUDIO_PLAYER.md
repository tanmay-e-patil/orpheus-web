# Feature Design: Home Route Audio Player with Synced Lyrics

## Summary

Enhance the /home route from a static song list to a playable library with:

- Row click to immediately play the track using its YouTube video ID.
- A persistent bottom player with play/pause and next/previous controls.
- A lyrics area that shows synced, scrolling lyrics (LRC) alongside album art.
- Audio-only playback (no visible YouTube video surface), while keeping YouTube embed present under the hood.

This design focuses on client-side playback using the YouTube IFrame Player API, a lightweight queue/state store, and a lyrics synchronizer.

## Goals and Non-goals

- Goals
  - Play a selected song from the /home table via `songs.youtubeVideoId`.
  - Provide transport controls (play/pause, next, previous).
  - Display album art and synced lyrics from `songs.syncedLyrics`.
  - Keep playback state persistent across navigations within the app router segment.
- Non-goals
  - Audio DSP, equalizer, or volume normalization.
  - Downloading or server-side proxying of YouTube content.
  - Full-featured playlist management beyond the visible list order.

## Requirements Mapping

1. Row click plays song (from youtube_id): Done via queue store + YouTube IFrame API.
2. Basic controls (play/pause/next/prev): Player bar with bound actions; auto-advance on track end.
3. Show synced lyrics + album art: Lyrics panel reading `syncedLyrics`; album art from `albumArt`.
4. No visible YouTube video: Embed stays invisible/minimized with audio-only UX; see Compliance notes.

## Data Contracts

- songsTable (drizzle, `lib/db/schema.ts`)
  - `spotifyId: string` (PK)
  - `name: string`
  - `artistName: string`
  - `albumName: string`
  - `albumArt: string` (URL)
  - `lyrics: string` (fallback unsynced)
  - `syncedLyrics: string` (LRC or timecoded text)
  - `isLyricsAvailable: boolean`
  - `duration: string` (e.g., ISO-8601, or formatted)
  - `youtubeVideoId: string` (FK to `ytMusicVideoTable.id`)

No schema changes are required for this feature.

## UX Outline

- Home table
  - Clicking any row starts playback and sets the queue to the current table ordering.
  - The active row is visually highlighted.
- Persistent bottom player (global within app shell)
  - Shows track name, artist, album art.
  - Controls: Previous, Play/Pause, Next, Seek (required), with elapsed/remaining time.
- Lyrics + Art panel (right side or a drawer on small screens)
  - Shows synced lyrics that auto-scrolls to the current line.
  - If `isLyricsAvailable` is false or `syncedLyrics` is empty, show unsynced `lyrics` or the message: "Lyrics not available."

## Architecture

### Components (new)

- `components/player/PlayerProvider.tsx` (client)
  - React context or Zustand store provider for queue and playback state.
- `components/player/YouTubeAudioPlayer.tsx` (client)
  - Lazily initializes YouTube IFrame Player API.
  - Exposes imperative controls: `play()`, `pause()`, `seekTo()`, `load(videoId)`.
  - Polls `getCurrentTime()` for lyrics synchronization (rAF ~ 250ms throttled).
- `components/player/PlayerBar.tsx` (client)
  - UI bar with transport controls, seek slider with time indicators, and now playing metadata.
- `components/player/LyricsView.tsx` (client)
  - Parses and renders synced LRC; highlights current line; smooth auto-scroll.

### Modified

- `app/(music-explorer)/home/page.tsx` and/or its `_components/*`
  - Add row `onClick` -> dispatch `setQueue([...songs], startIndex)`.
  - Add `PlayerBar` and `LyricsView` to the layout or page.

### State Management

- Store shape (Zustand; Context optional for composition)
  - `queue: Song[]` — list currently playable.
  - `currentIndex: number`
  - `status: 'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'error'`
  - `currentTime: number` (seconds)
  - `duration: number` (seconds)
  - Actions: `setQueue(songs, startIndex)`, `play()`, `pause()`, `next()`, `prev()`, `seek(seconds)`.
- Behavior
  - `setQueue`: replaces queue, sets `currentIndex`, loads `youtubeVideoId` into player, auto-plays.
  - `next/prev`: bounds check; if out-of-range on `next`, stop or loop (configurable; default stop).
  - `onEnd`: auto-advance `next()`.

### YouTube Playback (Audio-only)

- Use YouTube IFrame Player API via `YT.Player` in a hidden/minimized container.
- Suggested options: `playerVars: { controls: 0, disablekb: 1, modestbranding: 1, rel: 0 }`.
- Keep the iframe mounted (1x1 px or off-canvas) to avoid repeated re-initialization.
- Compliance note: YouTube ToS generally expects the embedded player to be visible and not obscured. Decision: proceed with a visually hidden iframe and show clear attribution near the player bar (e.g., “Audio via YouTube • Open on YouTube”).

### Lyrics Synchronization

- Input format: LRC (or similar). Parser outputs: `Array<{ timeMs: number; text: string }>`.
- Sync loop
  - Poll `player.getCurrentTime()` at ~4Hz (250ms) using rAF + throttling.
  - Binary search to find the active line by `timeMs`.
  - Apply highlight class and auto-scroll to keep active line centered.
- Fallbacks
  - No `syncedLyrics`: render `lyrics` (unsynced) with simple scroll.

### Accessibility

- Keyboard shortcuts: Space (play/pause), ArrowLeft/ArrowRight (seek ±5s), Shift+ArrowLeft/Shift+ArrowRight (prev/next).
- Buttons with proper labels, focus states, and ARIA pressed where applicable.
- Reduced motion: disable smooth scroll for lyrics if `prefers-reduced-motion`.

### Performance

- Lazy-load YouTube API only on first play.
- Preconnect to `https://www.youtube.com` and `https://www.google.com` in the app `<head>`.
- Avoid hydration issues by client-only dynamic imports for player components.

## Control Wiring

- Row click
  - Gather all rows as queue in current sort order.
  - Call `setQueue(queue, clickedIndex)`; Player loads and starts.
- Controls
  - Play/Pause: calls store actions, which forward to `YT.Player`.
  - Next/Prev: adjust `currentIndex`; load next track’s `youtubeVideoId`.
  - Seek: dragging the slider or using Arrow keys calls `seek(newTimeSeconds)` and updates the player position immediately.
- End of track
  - `onStateChange` to `ENDED`: call `next()`.

## Edge Cases

- Missing `youtubeVideoId`: disable play and show toast “No playable source.”
- YouTube blocked/region restricted: show error toast and attempt `next()`.
- No lyrics available: show placeholder “Lyrics not available.”
- Rapid navigation: keep player mounted at layout level to maintain continuity.

## Implementation Plan

1. State & Provider
   - Add `PlayerProvider` and global store.
   - Mount provider in `app/layout.tsx` (or `(music-explorer)/layout.tsx`).
2. YouTube player wrapper
   - Implement `YouTubeAudioPlayer` with lifecycle and imperative methods.
3. Player UI

- Build `PlayerBar` with shadcn/ui buttons and seek slider (shows elapsed/duration); wire to store.

4. Integrate with Home table
   - Add row click handler; feed queue; highlight active row.
5. Lyrics
   - Implement LRC parser + `LyricsView` synced to player time.
6. Polish
   - Accessibility, attribution, loading states, error toasts.

## Acceptance Criteria

- Clicking any row in /home immediately starts playback using the song’s `youtubeVideoId`.
- Visible player controls: play/pause, next, previous; next auto-advances on track end.
- Synced lyrics scroll in time with the song; album art is displayed.
- The YouTube video surface is not displayed to the user; only audio is heard. UI includes attribution to YouTube to support compliance.
- Seek control allows scrubbing to arbitrary positions, updating audio and time indicators promptly.

## Test Plan

- Unit: LRC parser with sample timed lines; edge cases (duplicate timestamps, empty lines).
- Unit: Seek time calculations (slider percent <-> seconds), boundary clamping (0..duration).
- Integration: Simulate row click -> player state transitions to `playing`; `next()`/`prev()` update index; dragging seek updates `currentTime` and player position.
- Manual: Verify lyrics synchronization visually on several tracks; verify behavior when lyrics are missing (“Lyrics not available.” message shown when `isLyricsAvailable` is false).

## Decisions

- Compliance: Clear attribution is sufficient; the embedded iframe will remain visually hidden while an attribution label is shown near the player bar.
- Controls: Seek is a required feature in v1 and shipped in the PlayerBar.
- State: Use Zustand for the playback store (Context optional for composition/injection).
- Lyrics fallback: If `isLyricsAvailable` is false, show the message “Lyrics not available.”
