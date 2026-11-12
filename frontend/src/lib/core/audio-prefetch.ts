import type { Song } from '../types';

type ConnectionInfo = { saveData?: boolean; effectiveType?: string };

// Bounded so a long listening session does not grow this forever.
const MAX_REMEMBERED = 50;
const prefetched = new Set<string>();

export function songAudioUrl(song: Song | null | undefined): string {
  if (!song) return '';
  return (
    song.audioUrl ||
    (song.trackId ? `/api/songs/${encodeURIComponent(song.trackId)}/audio` : '')
  );
}

function constrainedConnection(): boolean {
  const connection = (navigator as Navigator & { connection?: ConnectionInfo })
    .connection;
  return Boolean(
    connection?.saveData || connection?.effectiveType?.includes('2g'),
  );
}

/**
 * Warms the browser HTTP cache with the next song's audio so skipping to it
 * starts without a network round trip. The server sends
 * `Cache-Control: private, no-cache` with an ETag, so the cached copy is
 * revalidated (304) rather than trusted blindly.
 */
export function prefetchSongAudio(
  song: Song | null | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<void> | null {
  if (!song?.trackId || song.isAvailable === false) return null;
  const url = songAudioUrl(song);
  if (!url || prefetched.has(url) || constrainedConnection()) return null;
  if (prefetched.size >= MAX_REMEMBERED) prefetched.clear();
  prefetched.add(url);
  return fetchImpl(url, {
    credentials: 'same-origin',
    priority: 'low',
  } as RequestInit)
    .then(async (response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      // The body must be read to completion for the cache entry to be complete.
      await response.blob();
    })
    .catch(() => {
      // Allow a later retry; prefetch failures never affect playback.
      prefetched.delete(url);
    });
}

export function resetAudioPrefetch() {
  prefetched.clear();
}
