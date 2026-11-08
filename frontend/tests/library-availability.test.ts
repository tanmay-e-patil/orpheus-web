import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/svelte';
import { tick } from 'svelte';
import Library from '../src/pages/Library.svelte';
import { api } from '../src/lib/api';
import type { SongDetail } from '../src/lib/types';

const song = {
  trackId: 'pending',
  name: 'New song',
  artistName: 'Artist',
  albumName: 'Album',
  isAvailable: false,
};

async function openLibrary() {
  history.replaceState({}, '', '/library?sort=recentlyAdded');
  vi.spyOn(api, 'songs').mockResolvedValue({
    songs: [song, { ...song, trackId: 'ready', isAvailable: true }],
    nextCursor: null,
    hasMore: false,
  });
  vi.useFakeTimers();
  const view = render(Library);
  await vi.advanceTimersByTimeAsync(0);
  await tick();
  return view;
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it('polls unavailable songs every two seconds and stops once ready', async () => {
  const detail = vi
    .spyOn(api, 'song')
    .mockResolvedValueOnce({ song, audioSource: null })
    .mockResolvedValue({
      song: { ...song, isAvailable: true },
      audioSource: null,
    });
  const view = await openLibrary();
  expect(view.getByText('· Audio unavailable')).toBeInTheDocument();
  await vi.advanceTimersByTimeAsync(1999);
  expect(detail).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(detail).toHaveBeenCalledTimes(1);
  expect(detail).toHaveBeenCalledWith('pending', expect.any(AbortSignal));
  await vi.advanceTimersByTimeAsync(2000);
  await tick();
  expect(view.queryByText('· Audio unavailable')).toBeNull();
  await vi.advanceTimersByTimeAsync(4000);
  expect(detail).toHaveBeenCalledTimes(2);
});

it('retries failures without clearing the library', async () => {
  const detail = vi
    .spyOn(api, 'song')
    .mockRejectedValueOnce(new Error('Offline'))
    .mockResolvedValue({
      song: { ...song, isAvailable: true },
      audioSource: null,
    });
  const view = await openLibrary();
  await vi.advanceTimersByTimeAsync(2000);
  expect(view.getAllByRole('listitem')).toHaveLength(2);
  expect(view.queryByRole('alert')).toBeNull();
  await vi.advanceTimersByTimeAsync(2000);
  await tick();
  expect(detail).toHaveBeenCalledTimes(2);
  expect(view.queryByText('· Audio unavailable')).toBeNull();
});

it('avoids overlapping requests and aborts polling on leaving the library', async () => {
  let resolve!: (value: SongDetail) => void;
  const detail = vi.spyOn(api, 'song').mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const view = await openLibrary();
  await vi.advanceTimersByTimeAsync(6000);
  expect(detail).toHaveBeenCalledTimes(1);
  const signal = detail.mock.calls[0][1]!;
  view.unmount();
  expect(signal.aborted).toBe(true);
  resolve({ song: { ...song, isAvailable: true }, audioSource: null });
  await vi.advanceTimersByTimeAsync(4000);
  expect(detail).toHaveBeenCalledTimes(1);
});

it.each(['unavailable', 'failed'])(
  'stops after 30 %s checks per song until the library is reopened',
  async (result) => {
    const detail = vi.spyOn(api, 'song');
    if (result === 'failed') detail.mockRejectedValue(new Error('Offline'));
    else detail.mockResolvedValue({ song, audioSource: null });
    const view = await openLibrary();
    await vi.advanceTimersByTimeAsync(60000);
    expect(detail).toHaveBeenCalledTimes(30);
    await vi.advanceTimersByTimeAsync(60000);
    expect(detail).toHaveBeenCalledTimes(30);
    expect(view.getByText('· Audio unavailable')).toBeInTheDocument();
    view.unmount();
    await openLibrary();
    await vi.advanceTimersByTimeAsync(2000);
    expect(detail).toHaveBeenCalledTimes(31);
  },
);

it('defaults to recently added when no sort is requested', async () => {
  history.replaceState({}, '', '/home');
  const songs = vi.spyOn(api, 'songs').mockResolvedValue({
    songs: [],
    nextCursor: null,
    hasMore: false,
  });
  render(Library);
  await tick();
  expect(songs).toHaveBeenCalledWith(
    null,
    100,
    expect.any(AbortSignal),
    'recentlyAdded',
  );
  expect(location.pathname + location.search).toBe('/home');
});
