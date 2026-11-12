import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  prefetchSongAudio,
  resetAudioPrefetch,
  songAudioUrl,
} from '../src/lib/core/audio-prefetch';
import type { Song } from '../src/lib/types';

const song = (trackId: string, extra: Partial<Song> = {}) =>
  ({
    trackId,
    name: trackId,
    artistName: 'Artist',
    albumName: 'Album',
    isAvailable: true,
    ...extra,
  }) as Song;

const ok = () =>
  vi.fn(
    async () => new Response('audio', { status: 200 }),
  ) as unknown as typeof fetch;

beforeEach(() => resetAudioPrefetch());
afterEach(() => vi.unstubAllGlobals());

it('builds the versioned audio URL or falls back to the track route', () => {
  expect(
    songAudioUrl(song('a b', { audioUrl: '/api/songs/a%20b/audio?v=1' })),
  ).toBe('/api/songs/a%20b/audio?v=1');
  expect(songAudioUrl(song('a b'))).toBe('/api/songs/a%20b/audio');
  expect(songAudioUrl(null)).toBe('');
});

it('prefetches the next song once with credentials and low priority', async () => {
  const fetchImpl = ok();
  await prefetchSongAudio(song('next'), fetchImpl);
  expect(prefetchSongAudio(song('next'), fetchImpl)).toBeNull();
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  expect(fetchImpl).toHaveBeenCalledWith('/api/songs/next/audio', {
    credentials: 'same-origin',
    priority: 'low',
  });
});

it('skips missing, unavailable songs and constrained connections', () => {
  const fetchImpl = ok();
  expect(prefetchSongAudio(undefined, fetchImpl)).toBeNull();
  expect(
    prefetchSongAudio(song('x', { isAvailable: false }), fetchImpl),
  ).toBeNull();
  vi.stubGlobal('navigator', { connection: { saveData: true } });
  expect(prefetchSongAudio(song('y'), fetchImpl)).toBeNull();
  vi.stubGlobal('navigator', { connection: { effectiveType: 'slow-2g' } });
  expect(prefetchSongAudio(song('z'), fetchImpl)).toBeNull();
  expect(fetchImpl).not.toHaveBeenCalled();
});

it('allows a retry after a failed prefetch', async () => {
  const failing = vi.fn(
    async () => new Response('', { status: 503 }),
  ) as unknown as typeof fetch;
  await prefetchSongAudio(song('retry'), failing);
  const fetchImpl = ok();
  await prefetchSongAudio(song('retry'), fetchImpl);
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});
