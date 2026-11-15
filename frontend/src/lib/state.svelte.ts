import { SvelteMap } from 'svelte/reactivity';
import { mediaQuery } from './media-query';
import { player } from './core/player-store.svelte';
import type { Session } from './types';

export const auth = $state<{ session: Session | null }>({ session: null });

export const cacheUserId = () => auth.session?.user?.id || 'single-user';

export const ui = $state({
  nowPlaying: false,
  playerPaneCollapsed: false,
  // Preserve the iframe's container while fullscreen changes the viewport.
  videoDockedLayout: null as boolean | null,
  focusLibrarySearch: false,
});

export const library = $state({
  version: 0,
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
