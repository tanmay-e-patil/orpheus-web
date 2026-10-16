# Mobile UI review

Reviewed the frontend in the collaborative browser using a temporary private preview and synthetic API data. No production backend was used.

## Improvements included

- Navigation wraps into two rows so the brand, theme selector, and navigation links do not compete for one narrow row.
- Library search takes its own row; each mobile song has an independent Edit action.
- Buttons and icon controls have at least 44px touch targets, and form controls use 16px text to avoid automatic input zoom on iOS.
- Lyrics move out of the fixed side panel below 1200px, with an explicit Lyrics button opening the existing dialog.
- The player wraps controls at narrow widths and accounts for the bottom safe area.
- The four-step add-song indicator fits the viewport instead of requiring horizontal scrolling.
- Edit-page result cards stack on mobile; draft and passkey controls wrap.

## Suggested next improvements

1. **Use a compact player with an expanded Now Playing sheet.** Keep the song name and play/pause visible while scrolling; move seeking, video, and secondary actions into the expanded view. The current wrapping player preserves access but can occupy a large part of a small screen.
2. **Put account and appearance controls in Settings.** Theme currently consumes header space, and mobile has no visible sign-out action because the sign-out button lives in the hidden desktop sidebar. Add sign-out to Settings and move the theme selector there before removing it from the header.
3. **Group the song editor into expandable sections.** Metadata, audio source, lyrics, and regeneration form a long page. Keep metadata open and collapse secondary sections, with a clear save/result message per section.
4. **Evaluate bottom navigation.** Library, Add songs, and Settings are stable destinations. A three-item bottom bar would improve thumb access, but it must share space deliberately with the mini-player and device safe area.
5. **Use inline validation and preserve form position.** Put errors beside the relevant field, focus the first invalid field, and keep save progress near the button rather than forcing users to find results below a long form.

## Validation

- Library/player layouts checked at 320, 390, 768, 1024, and 1280px, including a selected unavailable song: no document or player horizontal overflow.
- At 320px, the Review form and progress indicator also fit the viewport; the song editor had no document horizontal overflow.
- Direct Edit opened a different song without changing the current player selection.
- Search submitted with Enter. Starting a new search preserved the previous session as a draft; Undo restored a discarded session.
- The Lyrics button opened the dialog; Escape closed it.
- Review saved directly, showed a success message, cleared the active draft, and offered Go to Tracks.
- Clearing a no-results library search restored the song list.
- Eight Node tests cover matching and saving, including partial retries, duplicate submission protection, missing confirmations, draft isolation, and network failure recovery.

Real iOS/Android testing is still needed for the virtual keyboard, safe areas, audio playback, and dialog focus behavior. Modified-link behavior should also be checked on a desktop browser. The preview server is shut down after review.
