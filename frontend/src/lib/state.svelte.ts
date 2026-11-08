import { SvelteMap } from 'svelte/reactivity';
import { mediaQuery } from './media-query';
import { player } from './core/player-store.svelte';
import type { Session } from './types';

export const auth = $state<{ session: Session | null }>({ session: null });

/** IndexedDB cache scope for the signed-in user. */
export const cacheUserId = () => auth.session?.user?.id || 'single-user';

export const ui = $state({
  nowPlaying: false,
  playerPaneCollapsed: false,
  // Preserve the iframe's container while fullscreen changes the viewport.
  videoDockedLayout: null as boolean | null,
  // Set by the global shortcut; the library page focuses its search and clears it.
  focusLibrarySearch: false,
});

export const library = $state({
  // Bump to make the library page reload songs from the server.
  version: 0,
  // Latest play counts recorded during this session, keyed by track ID.
  playCounts: new SvelteMap<string, number>(),
});

const widePlayer = mediaQuery(
  '(min-width: 1000px) and (orientation: landscape)',
);

export const layout = {
  get dockedPlayer() {
    return (
      !!player.song &&
      (ui.videoDockedLayout ?? widePlayer.current) &&
      !ui.playerPaneCollapsed
    );
  },
};

export const errorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : 'Something went wrong. Please try again.';
