import { afterEach, it, expect, vi } from 'vitest';
import { api } from '../src/lib/api';
afterEach(() => vi.unstubAllGlobals());
it('preserves the matching API contract and omits UI-only video fields', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      new Response('[]', { headers: { 'Content-Type': 'application/json' } }),
    );
  vi.stubGlobal('fetch', fetcher);
  await api.matchDeezerTracks(
    [{ id: 'video', title: 'A song', selected: true, confidence: 97 }],
    'Original query',
  );
  const [url, options] = fetcher.mock.calls[0];
  expect(url).toBe('/api/discover/deezer/matches');
  expect(JSON.parse(options.body)).toEqual({
    searchQuery: 'Original query',
    videos: [{ id: 'video', title: 'A song' }],
  });
  expect(options.credentials).toBe('same-origin');
});
it('dispatches unauthorized responses so the app clears playback and returns to login', async () => {
  const listener = vi.fn();
  window.addEventListener('orpheus:unauthorized', listener);
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'Sign in again' } }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  );
  try {
    await expect(api.song('song')).rejects.toThrow('Sign in again');
    expect(listener).toHaveBeenCalledOnce();
  } finally {
    window.removeEventListener('orpheus:unauthorized', listener);
  }
});
it('deletes encoded song IDs and accepts an empty idempotent response', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal('fetch', fetcher);
  await expect(api.deleteSong('song /?')).resolves.toBeNull();
  expect(fetcher).toHaveBeenCalledWith(
    '/api/songs/song%20%2F%3F',
    expect.objectContaining({ method: 'DELETE', credentials: 'same-origin' }),
  );
});
