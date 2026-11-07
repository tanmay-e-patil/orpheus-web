# Discovery UX: search, then review

Applied the requested `krug-usability-review` skill and its review lenses, read from `main:/home/ubuntu/.codex/skills/krug-usability-review/` over SSH.

Reviewed `feature/discovery-confidence` at `1b4f7a9` plus the working changes in this conversation. Evidence is the repository, earlier user screenshots, service responses from prior testing, and synthetic component tests. The initial pass did **not** include a successful visual browser inspection: T3 navigation worked, but two snapshots timed out; the fallback browser reported no browser available. At that point desktop/mobile layout and real playback remained manual checks; see the component follow-up below. No participant study or accessibility-conformance claim is implied.

## Main task and findings

**High — The user has to operate the lookup pipeline.** Previously, search opened audio selection, and uncertainty could open separate song-info and lyrics stages. These choices require the user to evaluate material the app can often rank itself. New searches now open `/discover/review` immediately. Query relevance, recording-version intent, audio/Topic hints, and metadata evidence select a source automatically; at most three sources are checked. Uncertain metadata becomes an editable suggestion on review. Explicitly conflicting candidates are not automatically selected. Save remains the necessary commitment boundary.

**High — Optional lyrics can block the core task.** A provider outage previously held the user on an earlier screen. Review is now editable and saveable after source/metadata matching, while lyrics load independently. Failure, no results, and pending lookup have distinct local messages. Retry and manual lyrics entry stay beside the lyrics. Save never waits for optional lyrics.

**High — Corrections must survive further lookups.** Changing the source preserves metadata and lyric edits and asks the user to recheck timing. Retrying lyrics preserves manual edits, including deliberately empty lyrics. A cancelled or stale response cannot reinsert lyrics after the active song/source changed, a new draft started, or saving completed. Commit uses the reviewed text, preventing an older selected lyric object from restoring removed content.

**Medium — Preview tools are separated from the final decision.** Audio playback and synced-lyric tests are now in the review workspace. Clicking a lyric line seeks the video; earlier/later controls shift all timestamps by half a second. Playback failures include an external YouTube link, and source corrections stay on the same page. This was verified with a simulated player; real embedding, audible playback, and synchronization still need manual testing.

**Medium — The primary action can be distant from the corrections.** A compact Save footer follows the review content, states that nothing is added until saving, and never floats over lyrics or fields. Advanced metadata and alternative searches use accessible disclosure controls instead of competing full-screen steps. The responsive layout puts source preview first on narrow screens and reserves space above the application player/navigation. The initial layout was implemented in CSS without visual verification; the follow-up below records the subsequent browser checks.

## Existing strengths retained

- Automatic draft persistence and resuming after interruption.
- Explicit saving, duplicate-submit protection, retry after failures, and library-cache invalidation.
- Separate metadata art and video-thumbnail labels.
- Conservative identity checks and popularity tie-breaking; popularity does not make a conflicting recording correct.
- Compatibility with existing multi-stage drafts, which retain their old routes and behavior. New searches use the review-first workspace.

## Implementation and verification

- Entry point: [Discovery.svelte](../frontend/src/pages/Discovery.svelte).
- Workflow and persistence: [DiscoveryReview.svelte](../frontend/src/lib/components/DiscoveryReview.svelte).
- Focused sections: [DiscoveryAudio.svelte](../frontend/src/lib/components/DiscoveryAudio.svelte), [DiscoveryMetadata.svelte](../frontend/src/lib/components/DiscoveryMetadata.svelte), [DiscoveryLyrics.svelte](../frontend/src/lib/components/DiscoveryLyrics.svelte).
- Source ranking and fallback identity: [discovery.ts](../frontend/src/lib/discovery.ts).
- Playback and lyric seeking: [VideoFrame.svelte](../frontend/src/lib/components/VideoFrame.svelte).
- Behavior tests: [discovery-review.test.ts](../frontend/tests/discovery-review.test.ts). Existing discovery tests cover legacy drafts.

Implementation order was entry/automatic preparation, in-place recovery and corrections, optional lyrics with stale-response guards, then previews/timing and responsive hierarchy. Automated tests cover these boundaries without contacting providers or pretending synthetic playback proves real timing.

## Manual participant tasks

1. Find a known song and save it after previewing, without being told which controls to use.
2. Search for a live or cover version; recognize which recording was chosen and correct a wrong source without losing an edited title.
3. With lyrics unavailable, finish saving; later add lyrics and test timing. On a phone-sized screen, check that the full-width Save action, keyboard, navigation, and preview controls do not obscure each other.

The next useful validation is this manual pass on localhost, especially real YouTube embedding and mobile lyric timing.


## Shadcn component follow-up

The three review panels now use Card, with Accordion correction controls,
Alert notices, Field labels/descriptions, Badge labels, Skeleton loading states,
Scroll Area results and a shared lyric display, and Tooltip timing help. Result choices and lyric
seeking use the existing shadcn Button. Custom CSS now owns layout and playback
presentation rather than duplicating card/disclosure/notice styling.

Validation: 143 frontend tests pass, including opening advanced fields without
saving, preserving edits across disclosure changes, source corrections, lyric
seeking/following, and replacing the static thumbnail with one player. Type
checking has no errors/warnings and the production build passes. The build reports
a 527 kB main JavaScript chunk (149 kB gzip); route splitting remains a potential
performance follow-up.

T3 capture recovered after a short recording start/stop cycle. A synthetic review
fixture was inspected at desktop width with no console errors, and source-change
controls were exercised in the browser. A 390 px iframe checked the real CSS
breakpoint: all three panels rendered, the preview appeared before song info,
and document width stayed 390 px without horizontal overflow. This used isolated
example data and did not validate authenticated saving, real YouTube playback,
mobile keyboards, or the surrounding application player/navigation. The temporary
fixture was removed after verification.


## Shared lyrics and Accordion follow-up

Correction sections now use shadcn Accordion in multiple-open mode. Both Now
Playing and the review preview render `LyricsDisplay.svelte`, reusing the same
large lyric lines, active-line styling, smooth centering, and reduced-motion
behavior. Player-specific wrappers provide their own playback time and seek
callback. Review also supports plain lyrics in the same display. The earlier
small preview-specific lyric renderer and centering logic were removed.

Validation: 146 frontend tests, type checking, and build pass. Coverage includes
independent preview/library seeking, multiple open correction sections, and the
existing lyric-scroll reset scenarios. The build's main chunk is 533 kB (151 kB
gzip). The browser disconnected during the final visual check of this follow-up;
there is no new visual or real-playback claim for this iteration.


## Save action follow-up

The floating full-width save bar was removed because it covered review content.
Saving now sits in a normal-flow footer after the panels, with one short helper
line and a 44 px primary button. On small screens the button fills the available
width. A library icon describes the action; a checkmark appears only after a
successful save. Pending commits show Saving feedback and disable repeat submits.
