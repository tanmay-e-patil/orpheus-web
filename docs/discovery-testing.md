# Testing song discovery locally

Run Go on port 8080 with `infisical run --env=dev`, overriding `DATABASE_URL` to the local PostgreSQL database. Set `APP_ENV=development`, `DOMAIN=localhost`, `AUTH_RP_ORIGIN=http://localhost:5173`, `PORT=8080`, `RABBITMQ_URL=''`, and `OUTBOX_DISPATCH_ENABLED=false` **inside** the Infisical command, after `-- env`, so imported secrets cannot override them. Run `bun run --cwd frontend dev --port 5173 --strictPort` and open http://localhost:5173.

No new database migrations or seed data are needed. An empty migrated database and a signed-in local account are sufficient. YouTube requires `YOUTUBE_API_KEY`. Deezer matching uses the website's `SearchFull` GraphQL operation with an automatically acquired anonymous token, cached in memory until shortly before expiry. No Deezer account credentials, browser cookies, or stored bearer token are needed. Rejected tokens refresh once; website API failures fall back to REST, with a 30-second pause before retrying GraphQL. LRCLib uses its existing public endpoint. The website API is undocumented, so REST fallback remains necessary. Saving stores metadata and pending jobs locally. Downloaded audio requires a separately configured consumer.

## Default flow: search, then review

Start a **new search** at `/discover`, enter a title and artist, and select **Find my song**. You should land immediately on `/discover/review`. The app chooses the source and suggests song info and lyrics. There is no required audio selection or separate lyrics stage.

The review workspace keeps **Song info**, **Song preview**, and **Lyrics** together. Use the disclosure under each section to search for replacements. Metadata fields can be edited directly. **Preview song** opens one player with synced lyrics whenever they are available. Play the video to check the audio and lyric timing together. The active lyric follows playback and stays in view; select a line to seek there and play. There is no separate timing mode. **Earlier 0.5 s** and **Later 0.5 s** change the timestamps that will be saved.

Song info must have a title, artist, and album; a missing catalogue match receives a stable video-based ID and editable fields. Lyrics are optional. Their lookup runs separately, so Save is available as soon as metadata is ready. Saving is always explicit. Source changes preserve edited metadata/lyrics; lyric retries preserve manual text and intentionally cleared lyrics. The reviewed text is authoritative at save time.

Existing drafts from the old multi-stage flow remain compatible with their previous routes and controls. Start a fresh search to exercise the new workflow.

## Cases to exercise

- A known song, such as **Firework Katy Perry**: expect an audio source and the full-length Katy Perry catalogue recording. Equally scoring releases prefer the higher GraphQL popularity; incorrect artists remain excluded from automatic suggestions.
- A remembered lyric: search `sia bulletproof`. YouTube relevance should lead to David Guetta / Sia's `Titanium`, above the lower-ranked literal-title upload `Sia - Bulletproof`. Discovery preserves provider order; the frontend makes bounded format/token adjustments instead of requiring every query word in the title.
- An explicit live, acoustic, remix, or cover request: the requested version should affect source ranking. An unrequested cover should rank below a relevant original audio upload.
- Missing or uncertain catalogue information: stay on review with a visible explanation and editable metadata. Confirm that manual fields can be saved without inventing a Deezer ID.
- An empty audio search or a provider error: recovery stays inside review and does not require navigating through earlier stages.
- A lyrics outage: metadata remains ready to save, with retry/manual entry available. No results and a failed lookup must have distinct copy.
- A pending lyrics request: edit or clear lyrics and confirm a late response cannot overwrite the decision. Save while lyrics are loading and confirm the completed draft is not recreated.
- Change the source after editing the title: the title and lyrics must survive. Recheck synced timing against the new source.
- Change metadata or retry lyrics after manual edits. Reload and verify the draft resumes without repeating completed automatic selection.
- Clear selected lyrics, save, and inspect the stored song: the old suggestion must not reappear.
- Test real audio playback and synced-line seeking. Check half-second shifts, player cleanup when switching sources/closing preview, and the external link when embedding fails.
- At desktop and phone widths, check reading order, wrapping, Save-bar clearance above the app player/navigation, keyboard focus, and disclosure controls.
- Save, refresh the library, and verify persistence. Jobs remain pending while dispatch is disabled.

## Repeatable regression checks

The matching fixtures in `internal/services/song_match_test.go`, `deezer_test.go`, and `lrclib_test.go` run against fixed inputs and mocked service responses. They cover the above identity, ambiguity, fallback, and error cases without calling public APIs. `frontend/tests/discovery-review.test.ts` covers the new automatic review flow, source/lyrics corrections, preview seeking and timing, manual metadata, nonblocking lyrics, persistence, and stale requests. `frontend/tests/discovery.test.ts` retains regression coverage for legacy drafts. Most fixtures are synthetic. `internal/services/testdata/deezer_search_full_firework.json` contains a minimized live GraphQL response for the Firework search, with album dates retained for metadata coverage and no authentication data. Its regression test verifies the most popular equally matching full 228-second Katy Perry recording is selected, the best result is deduplicated, and album artwork/date survive conversion. GraphQL tests also cover cached anonymous authentication, rejected-token refresh, bounded retries, and REST fallback for HTTP failures, HTTP-200 GraphQL errors, and malformed or empty responses.

```sh
go test ./...
bun run --cwd frontend check
bun run --cwd frontend test
bun run --cwd frontend build
```

### Review component checks

The review panels use shadcn-svelte Card, Accordion, Alert, Field, Badge,
Skeleton, Scroll Area, and Tooltip components. Correction disclosures must never
submit the song form. Open the advanced fields or lyric editor, change a value,
close and reopen the disclosure, and confirm the edit remains. Selecting a lyric
line should still seek/play and scroll only the lyric viewport. Opening preview
must replace the static source thumbnail rather than showing both.

If the T3 preview can evaluate the page but snapshots time out, a short recording
start/stop cycle restored snapshot capture during this session. This is a
workaround for the host's background capture behavior, not an Orpheus change.


The review preview and Now Playing both render `LyricsDisplay.svelte`. The
component accepts lyrics, the current position, and a seek callback; it owns
active-line highlighting and centering. Review supplies its YouTube preview
clock, while Now Playing supplies the library player clock. Tests verify that
preview seeking does not change the library player position, and that library
lyric clicks still seek the main player. Correction sections use shadcn Accordion
in multiple-open mode and preserve edits when closed/reopened.
