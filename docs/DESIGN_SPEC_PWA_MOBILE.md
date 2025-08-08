# Orpheus Web – PWA & Mobile Responsiveness Design Spec

## Requirements checklist

- PWA conversion (manifest, service worker, installable, offline-first basics)
- Responsive sidebar: collapsible, not fixed height, mobile-friendly
- Songs table: mobile list view with album art + “song — artist” in one column
- Discover workflow: responsive layout for mobile dimensions
- PlayerBar (mobile-only): seek bar at the border using full width

## Overview and goals

- Target: Next.js 15 (App Router), Bun runtime, Vercel-compatible.
- Outcome: Installable PWA with solid offline support for shell + static assets; mobile-friendly UI for core flows without breaking desktop.
- Success criteria: Lighthouse PWA score ≥ 90, app installable, main flows usable on small screens (iPhone SE/13 Pro Max, Pixel 6), no layout shifts.

## PWA implementation

### App manifest

- Add `app/manifest.ts` using `MetadataRoute.Manifest` returning:
  - name/short_name: Orpheus
  - start_url: "/"
  - display: standalone
  - background_color / theme_color: match UI theme (e.g., #0B0B0B dark)
  - icons: 192x192, 512x512, maskable variants (place under `public/icons/*`)
- Ensure Next.js favicons via `app/icon.png` and `app/apple-icon.png` are present and sized.

### Service worker and caching

- Use next-pwa with App Router support in `next.config.ts`:
  - Generate SW in production; disable in dev.
  - Precache: app shell, static assets, CSS/JS, fonts, top routes (`/home`, `/search`, `/player`).
  - Runtime caching:
    - Images (album art, YouTube thumbs): stale-while-revalidate with expiration (maxEntries ~200, maxAge ~7d).
    - API GETs (Spotify/YouTube via server actions are server-side; for client routes like `/api/lyrics/*`): network-first with short fallback cache (~60s) when online, cache-only when offline with graceful UI.
    - Navigation requests: network-first with fallback to cached shell.
- Registration: add a tiny client component `ServiceWorkerRegister` mounted in `app/layout.tsx` to register SW in production.
- Offline UX:
  - If offline, library browsing still works for cached lists/images.
  - Search/Discover show offline banner and disabled actions.
  - Player shows a message when stream requires network.

### Installability

- Add meta: `theme-color` (both light/dark), `apple-mobile-web-app-capable` and `status-bar-style`.
- Test A2HS on Android Chrome and iOS Safari (Web App Manifest + apple touch icons).

## Responsive UI changes

### 1) Sidebar: collapsible and responsive

- UX behavior:
  - ≥ lg: Full sidebar, sticky, height = 100dvh, overflow-y-auto; no fixed pixel height.
  - md to lg: Condensed “rail” (icons only) with tooltip labels; expand on hover/click.
  - < md: Hidden; surfaced via top bar hamburger that opens a slide-in drawer.
- Implementation:
  - Replace fixed height with `h-dvh md:sticky md:top-0 flex flex-col` and `overflow-y-auto`.
  - Use shadcn/ui `Sheet` or `Dialog` as a slide-over for mobile navigation.
  - Keep selection state in URL or global store to avoid layout thrash.
  - Files:
    - `components/sidebar.tsx`: refactor to responsive layout; add hamburger trigger for mobile (placed in page headers like `app/(music-explorer)/layout.tsx`).
    - Optionally add `components/sidebar-trigger.tsx`.
- Acceptance:
  - No vertical overflow on small screens.
  - Hamburger opens/closes smoothly; focus is trapped in the drawer; ESC closes.
  - Desktop unchanged aside from eliminating fixed height bugs.

### 2) Songs table: mobile list view

- UX behavior:
  - Desktop: current table remains.
  - Mobile (< md): single-column list item:
    - Left: album art (40–56px).
    - Right: “Song Name — Artist Name” (two-line clamp), secondary text muted.
    - Entire row tap target ≥ 44px height, trailing chevron or context menu optional.
- Implementation:
  - In `app/home/_components/SongTable.tsx`:
    - Add responsive column visibility using Tailwind utilities (e.g., `hidden md:table-cell`) for non-essential columns.
    - For < md, render a `SongListItem` layout (flex row) instead of a table row. You can conditionally branch on CSS (container queries) or a small hook for media query.
  - Ensure keyboard navigation and row actions preserved.
- Acceptance:
  - Only album art + combined title/artist show on mobile.
  - No horizontal scrolling; long text truncates gracefully.
  - Row tap plays/opens same action as desktop row.

### 3) Discover workflow: mobile responsive

- UX behavior:
  - Stepper/progress at top, sticky, compact.
  - Content stacks into a single column; cards go full-width with 16px gutters.
  - Buttons full-width; reduce padding on large cards; prioritize primary action visibility.
- Implementation:
  - Update:
    - `app/(music-explorer)/discover/_components/WorkflowProgress.tsx`: add compact stepper variant; sticky top `top-[calc(env(safe-area-inset-top)+0px)] z-30`.
    - Step pages and components (`_components/DiscoverLanding.tsx`, and per-step components under `spotify/`, `youtube/`, `review/`, `lyrics/`, `commit/`): wrap in responsive container (`max-w-screen-md mx-auto px-4 sm:px-6`), stack grids to 1-col on < md, ensure images/media scale to width.
  - Maintain consistent footer action bar with primary/secondary buttons visible without overlap with PlayerBar.
- Acceptance:
  - No horizontal scroll at 320px width.
  - Stepper readable and tappable; progression unchanged.
  - Critical CTAs above fold or reachable without awkward scrolling.

### 4) PlayerBar (mobile): full-width seek bar at top border

- UX behavior:
  - On mobile only: seek bar becomes a thin track pinned to the top border of the PlayerBar, spanning full width edge-to-edge.
  - Primary controls (play/pause/prev/next) above the track; secondary controls collapsed into a menu.
- Implementation:
  - In `components/player/PlayerBar.tsx`:
    - Add mobile variant: `absolute inset-x-0 top-0` progress bar with full width. Keep the PlayerBar container padded for the bottom safe-area (home indicator) as needed, but the progress track itself sits at the top edge of the bar.
    - Increase control touch targets to 44x44.
    - Ensure performance: throttle time updates to prevent jank.
  - In `components/player/YouTubeAudioPlayer.tsx`: no change unless event wiring needs debounce for mobile.
- Acceptance:
  - Seek bar aligns to the very top edge of the PlayerBar, full width; no gaps.
  - Dragging the seek handle is smooth; no overlap with iOS home indicator (PlayerBar still respects bottom safe area for controls).

### 5) Lyrics overlay on PlayerBar tap (mobile)

- UX behavior:
  - On mobile only, tapping the PlayerBar opens a full-screen lyrics overlay showing the synced/plain lyrics for the current track.
  - The overlay covers the page (modal) and keeps audio playback uninterrupted.
  - Provide multiple dismissal methods: close button (X), swipe-down gesture (optional), tap outside (if not conflicting with drag), and browser back on Android.
  - Safe-area insets respected; content is scrollable with the currently active lyric line auto-centered.
  - Prevent accidental opens when the tap is on the seek bar (taps on track-info or controls open, taps on progress bar continue to seek only).
- Implementation:
  - Use the existing `LyricsView` component inside a mobile-first full-screen modal (shadcn/ui `Dialog`).
  - State management: add `isLyricsOverlayOpen` with `open/close/toggle` actions in the player store, or a colocated state if preferred; wire PlayerBar tap to `open` on mobile breakpoints only.
  - Mount the overlay at the app root (layout) so it’s available across pages and maintains playback context.
  - Styling: `w-[100vw] h-[100dvh]` with background/blur as desired; ensure z-index is above PlayerBar; respect `env(safe-area-inset-*)`.
  - Interaction guard: exclude clicks on the progress/volume bars from opening; small debounce (e.g., 150ms) to differentiate drag vs tap.
- Accessibility:
  - Focus trap within the modal, `aria-label` on the close button, ESC closes, and return focus to the PlayerBar trigger element.
  - Maintain sufficient contrast and font scaling; support dynamic type where practical.
- Acceptance:
  - Tap on PlayerBar (non-progress area) opens lyrics overlay within 200ms.
  - Dismiss restores the prior page state; audio continues seamlessly during open/close.
  - Overlay renders LyricsView synced to playback; safe-area and scroll behavior verified on iOS/Android.

## Accessibility and safe-area considerations

- Respect `env(safe-area-inset-top|bottom|left|right)` for bottom PlayerBar and top sticky headers/steppers.
- Maintain focus order and keyboard navigability when sidebar becomes a drawer.
- Provide aria-labels for mobile-only icon buttons; keep color contrast ≥ 4.5:1.

## Files to add/update (high level)

- Add:
  - `app/manifest.ts` (manifest)
  - `public/icons/*` (192, 512, maskable; plus apple-touch-icon)
  - `components/ServiceWorkerRegister.tsx` (client registration)
- Update:
  - `next.config.ts` (wrap with next-pwa, runtimeCaching)
  - `app/layout.tsx` (mount SW register; meta tags/theme-color)
  - `components/sidebar.tsx` (responsive, collapsible)
  - `app/home/_components/SongTable.tsx` (mobile list view)
  - `app/(music-explorer)/discover/_components/WorkflowProgress.tsx` and step components (responsive stacks)
  - `components/player/PlayerBar.tsx` (mobile seek bar layout)

## QA and validation

- Automated:
  - Lighthouse PWA audit: score ≥ 90, “Installable” ✅, “Service worker” ✅, “Manifest” ✅.
- Manual:
  - Install on Android Chrome and iOS Safari; verify splash, icon, status bar color.
  - Offline:
    - Load app online once, then go offline. Verify app shell loads, cached home and search route shells load, images previously seen load, search shows offline state.
  - Responsive checks at 320, 375, 414, 768, 1024 widths.
  - PlayerBar seek interaction on iOS and Android; no overlap with home indicator.
  - Sidebar drawer focus trap and ESC behavior.

## Risks and mitigations

- next-pwa compatibility with Next 15: stick to the latest 5.x release and App Router config; if issues arise, fallback to a custom Workbox SW build.
- Caching dynamic API routes: keep short TTL and safe fallbacks to avoid stale sensitive data.
- YouTube/Spotify streaming won’t work offline; show clear offline UI.

## Effort estimate

- PWA (manifest, SW, config, icons): 0.5–1 day
- Sidebar responsive refactor: 0.5 day
- Songs table mobile variant: 0.5 day
- Discover workflow responsiveness: 1 day
- PlayerBar mobile seek bar: 0.5 day
- QA + polish: 0.5–1 day
- Total: ~3–4 days

## Next steps

- Confirm branding colors and icons for maskable icon generation.
- Implement PWA scaffolding and build once to validate SW registration.
- Tackle UI changes in this order: Sidebar → Songs table → Discover → PlayerBar.
- Run Lighthouse and device tests; iterate on any regressions.
