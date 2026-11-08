import { afterEach, it, expect, vi } from 'vitest';
import { api, onUnauthorized } from '../src/lib/api';
import type { CommitItem } from '../src/lib/core/workflow-save';
afterEach(() => vi.unstubAllGlobals());
it('saves a discovery selection without sending discovery-only video fields', async () => {
  const fetcher = vi.fn().mockResolvedValue(
    new Response('{"results":[]}', {
      headers: { 'Content-Type': 'application/json' },
    }),
  );
  vi.stubGlobal('fetch', fetcher);
  const song = { id: 'track', name: 'Song', artist: 'Artist' };
  const edits = { trackName: 'Edited song', syncedLyrics: '' };
  await api.commit([
    {
      song,
      video: {
        id: 'video',
        title: 'Artist - Song',
        thumbnail: 'https://example.test/art.jpg',
        channelTitle: 'Artist',
        publishedAt: '2026-01-01',
        duration: 'PT3M',
        viewCount: '123',
        selected: true,
        confidence: 97,
        musicProbability: 0.99,
      },
      edits,
    },
  ] as unknown as CommitItem[]);
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({
    items: [
      {
        song,
        edits,
        video: {
          id: 'video',
          title: 'Artist - Song',
          thumbnail: 'https://example.test/art.jpg',
          channelTitle: 'Artist',
          publishedAt: '2026-01-01',
          duration: 'PT3M',
          viewCount: '123',
        },
      },
    ],
  });
});
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
it('notifies unauthorized responses so the app clears playback and returns to login', async () => {
  const listener = vi.fn();
  const stop = onUnauthorized(listener);
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
    stop();
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
