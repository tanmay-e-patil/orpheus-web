import { get } from 'svelte/store';
import { clearSongsCache } from './core/idb-song-cache.js';
import { removeQueueSong } from './core/player-store.js';
import { libraryVersion, session } from './state';

const eventName = 'orpheus:song-deleted';
const storageKey = 'orpheus:song-deleted';

export function onSongDeleted(listener: (trackId: string) => void) {
  const handler = (event: Event) =>
    listener((event as CustomEvent<string>).detail);
  window.addEventListener(eventName, handler);
  return () => window.removeEventListener(eventName, handler);
}

async function applyDeletion(trackId: string) {
  // Abort page loads synchronously, before waiting for IndexedDB transactions.
  window.dispatchEvent(new CustomEvent(eventName, { detail: trackId }));
  removeQueueSong(trackId);
  const userId = get(session)?.user?.id || 'single-user';
  await clearSongsCache(userId).catch(() => {});
  libraryVersion.update((version) => version + 1);
}

export async function songDeleted(trackId: string) {
  const applying = applyDeletion(trackId);
  try {
    localStorage.setItem(
      storageKey,
      JSON.stringify({ trackId, nonce: crypto.randomUUID() }),
    );
  } catch {
    /* Local deletion still works when browser storage is disabled. */
  }
  await applying;
}

export function listenForSongDeletions() {
  const handler = (event: StorageEvent) => {
    if (event.key !== storageKey || !event.newValue) return;
    try {
      const value = JSON.parse(event.newValue);
      if (typeof value.trackId === 'string') void applyDeletion(value.trackId);
    } catch {
      /* Ignore malformed storage events. */
    }
  };
  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
}
