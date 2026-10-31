import { derived, readable, writable } from 'svelte/store';
import { getPlayerState, playerStore } from './core/player-store.js';
import type { Session, Song } from './types';
export const session = writable<Session | null>(null);
export const playback = readable(snapshot(), (set) => {
  const update = () => set(snapshot());
  playerStore.addEventListener('change', update);
  return () => playerStore.removeEventListener('change', update);
});
function snapshot() {
  const state = getPlayerState();
  return {
    ...state,
    controller: state.controller as {
      setVolume: (value: number) => void;
    } | null,
    queue: [...state.queue] as Song[],
    song: (state.queue[state.currentIndex] || null) as Song | null,
  };
}
export const nowPlaying = writable(false);
export const playerPaneCollapsed = writable(false);
export const widePlayerLayout = readable(false, (set) => {
  const media = window.matchMedia(
    '(min-width: 1000px) and (orientation: landscape)',
  );
  const update = () => set(media.matches);
  update();
  media.addEventListener('change', update);
  return () => media.removeEventListener('change', update);
});
// Preserve the iframe's container while fullscreen changes the viewport.
export const videoDockedLayout = writable<boolean | null>(null);
export const dockedPlayer = derived(
  [playback, widePlayerLayout, playerPaneCollapsed, videoDockedLayout],
  ([$playback, $wide, $collapsed, $videoLayout]) =>
    !!$playback.song && ($videoLayout ?? $wide) && !$collapsed,
);
export const libraryVersion = writable(0);
export const errorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : 'Something went wrong. Please try again.';
