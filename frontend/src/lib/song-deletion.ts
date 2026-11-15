import { clearSongsCache } from './core/idb-song-cache';
import { removeQueueSong } from './core/player-store.svelte';
import { cacheUserId, library } from './state.svelte';

// Other tabs learn about deletions through this localStorage key.
const storageKey = 'orpheus:song-deleted';
const listeners = new Set<(trackId: string) => void>();

export function onSongDeleted(listener: (trackId: string) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

async function applyDeletion(trackId: string) {
  // Abort page loads synchronously, before waiting for IndexedDB transactions.
  listeners.forEach((listener) => listener(trackId));
  removeQueueSong(trackId);
  await clearSongsCache(cacheUserId()).catch(() => {});
  library.version++;
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
    } catch {}
  };
  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
}
