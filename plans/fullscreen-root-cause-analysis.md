# Fullscreen root cause analysis

Date: 2026-10-16. Scope: native fullscreen from Video, in the T3 preview and on the reported phone.

## Conclusions

| Finding                                                                                 | Status                                                                                                |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| T3 Code 0.0.45 denies the preview's Electron fullscreen permission                      | Verified in the exact version's source; matches the observed browser and upstream incident            |
| A plain native request remains unresolved without Svelte or YouTube                     | Reproduced; raw results are in `fullscreen-preview-evidence.json`                                     |
| Electron 44.4.2 returns early when fullscreen permission is denied                      | Verified in version-matched source; explains the missing native transition                            |
| Our app uses a div fullscreen target and inline YouTube playback                        | Verified in application source                                                                        |
| That wrapper fullscreen API is unavailable on iPhone's documented WebKit implementation | Documented compatibility defect; the user confirmed the affected device is an iPhone                  |
| The particular phone has the same pending-promise failure                               | Not established: iPhone confirmed, but OS/browser, launch context, and runtime trace are not supplied |

The preview cause and an iPhone implementation incompatibility are identified. The user confirmed the phone is an iPhone. Its exact browser/OS and runtime result remain unverified, so we must not claim that the phone produced the same pending promise. The device tool returned “Agent device access is turned off for this environment.”

## Preview causal chain

The preview identifies itself as T3 Code 0.0.45, Electron 44.4.2, Chrome 152.0.7977.130 on macOS. The iPhone XR preset changes dimensions, not browser engine.

1. A trusted click calls `requestFullscreen()` with user activation present.
2. The page supports fullscreen and its web Permissions Policy permits it.
3. Electron forwards the operation to its separate host permission mechanism.
4. T3's v0.0.45 preview allowlist omits `fullscreen`. Both permission handlers consult the allowlist; the request handler supplies false.
5. Electron's `OnEnterFullscreenModeForTab` returns immediately if permission is denied, without executing the native fullscreen transition.
6. In this preview the renderer promise remains pending, no fullscreen event is observed, and the fullscreen element stays null.

This chain is supported by matching source and reproduction, not by a main-process debugger trace. The upstream incident reports the same app/Electron versions. The merged fix explicitly adds the missing permission and contains fullscreen within the preview surface.

Sources:

- [Exact T3 v0.0.45 permission policy](https://github.com/pingdotgg/t3code/blob/v0.0.45/apps/desktop/src/preview/BrowserSession.ts).
- [Electron v44.4.2 fullscreen implementation](https://github.com/electron/electron/blob/v44.4.2/shell/browser/api/electron_api_web_contents.cc).
- [Matching incident #16059](https://github.com/pingdotgg/t3code/issues/16059).
- [Merged fix #16961](https://github.com/pingdotgg/t3code/pull/16961), merged 2026-10-08 as `d9f7c0caed5cc0fe84cec97f2b6f002084542a4e`. The installed host still reports the older version; the fixed build was not tested here.

`document.fullscreenEnabled` and Permissions Policy do not establish that Electron's separate host permission will be granted. Earlier analysis overstated these checks.

## Reproduction and eliminated explanations

`frontend/tests/fullscreen-repro.html` calls the native API directly from a button click. Its first test has no Svelte import, player store, iframe, network dependency, or awaited render step.

Observed: activation true, focused document, fullscreen enabled, web policy allowed, then `pending-after-3s`, no resolve/reject/change/error event, and no fullscreen element. The later inspection still showed no result. This is a finite observation, not proof that a promise can never settle.

The earlier integrated-player reproduction also preserved activation across Svelte's render tick and had a connected, visible target with nonzero dimensions. Therefore Svelte timing, YouTube autoplay, iframe permission, and player transitions are not necessary to reproduce this preview failure. A no-gesture negative control was skipped because automation reported active user activation; it is not a passing test.

The preview is HTTP, but the [Fullscreen standard](https://fullscreen.spec.whatwg.org/#dom-element-requestfullscreen) does not universally restrict this API to secure contexts. HTTPS would not repair the identified host deny policy.

## Phone compatibility analysis

The app requests fullscreen on `.inline-video`, an HTML div. Its actual video element belongs to a cross-origin YouTube iframe; the parent cannot reach that video to invoke a native video-only method.

HTML element fullscreen and native video fullscreen are different capabilities. MDN's compatibility data limits the iOS element API to iPad, excluding iPhone; WebKit's iPhone issue remains open. On an affected iPhone the wrapper API can be absent rather than pending.

Our player also sets `playsinline: 1`. Google's documentation defines that as inline playback on iOS, while mode 0 selects fullscreen playback. Thus the implementation explicitly chooses inline video and relies on a wrapper API unavailable on iPhone. The user confirmed an iPhone, so this is a directly relevant application compatibility defect. We have not remotely executed code on that phone; unsupported element fullscreen is the source-supported explanation for standard iPhone Safari/WebKit, rather than a measured phone-side promise result.

Sources:

- [MDN compatibility data](https://github.com/mdn/browser-compat-data/blob/main/api/Element.json), `requestFullscreen`.
- [WebKit iPhone issue #206854](https://bugs.webkit.org/show_bug.cgi?id=206854).
- [YouTube playsinline documentation](https://developers.google.com/youtube/player_parameters#playsinline).

For Android Chrome, the iPhone explanation does not apply. A trace must distinguish denial, activation loss, embedded-WebView support, cancellation, and a genuinely unresolved promise. Direct browser tabs and embedded app browsers require separate checks.

## Why this was missed

- Optional invocation silently skipped absent APIs, and rejection errors were swallowed.
- Successful autoplay and sending a request were mistaken for successful fullscreen.
- A mobile-sized desktop preview was insufficient to validate mobile API support.
- Mocked tests exercised control flow rather than native permission behavior.
- The preview's pending promise was incorrectly assumed to explain the phone.

## Corrective actions and acceptance criteria

1. **Preview:** run a T3 build containing #16961, or validate in an external browser. This fix belongs to the host. Accept only when the standalone native request resolves and a fullscreen element/change is observed. No host upgrade was performed here.
2. **Confirmed iPhone device:** select YouTube's native-video fullscreen behavior for explicit Video playback, or use the iframe's own control. Do not rely on div fullscreen. Changing `playsinline` also requires preventing hidden prefetch seeks from launching native fullscreen and real-device validation. That behavior change was not implemented during this analysis.
3. **Other phone/browser:** compare the standalone HTML test and its optional YouTube modes in the affected launch context. Copy its visible JSON; no remote console is required.
4. **Diagnostics:** retain separate unsupported/rejected/pending/observed-fullscreen results. Three seconds pending is an observation, not a cancellation or proof of a browser defect.
5. **Regression checks:** validate real entry/exit, playback continuity, close/reopen, queue changes, unsupported APIs, and denial. A resolved mock alone is not native-fullscreen evidence.

No viewport fallback was added. Production playback behavior was not changed during this RCA; additions are this report, captured evidence, and the standalone development reproduction.

## Reproducing without authentication

Run `npm run dev --prefix frontend -- --host 0.0.0.0`. Open `/tests/fullscreen-repro.html` through the shared preview environment-port target, or on a phone through the same reachable development origin. Click “Request native fullscreen,” wait at least three seconds, and copy the visible results. Optional YouTube modes load only when selected and use Google's API example video. The test HTML is outside the production entry point and is not emitted by the normal build.

## iPhone implementation follow-up

Implemented after this analysis at the user's request: `InlineVideo.svelte` selects YouTube `playsinline=0` on iPhone/iPod, delegates fullscreen to native video playback, and skips the wrapper fullscreen request. The iframe still prepares at song start with `autoplay=0`, but background media seeks and the periodic preparation timer are disabled on that path. Playback starts from explicit activation; blocked autoplay keeps the existing audio and provides the direct Play video retry.

Regression tests cover iPhone player configuration, no background seek/play commands, synchronous activation, no wrapper fullscreen call, source handoff, cleanup, and gesture retry. These are application-level checks; native fullscreen still needs validation on a real iPhone. The desktop Electron preview cannot provide that device validation.
