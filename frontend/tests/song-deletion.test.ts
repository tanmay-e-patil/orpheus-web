import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import DeleteSongDialog from '../src/lib/components/DeleteSongDialog.svelte';
import Library from '../src/pages/Library.svelte';
import { api } from '../src/lib/api';
import {
  clearPlayer,
  getPlayerState,
  play,
  removeQueueSong,
  setController,
  setPlaybackStatus,
  setQueue,
  setTime,
} from '../src/lib/core/player-store.svelte';
import {
  listenForSongDeletions,
  onSongDeleted,
  songDeleted,
} from '../src/lib/song-deletion';
const one = {
  trackId: 'one',
  name: 'One',
  artistName: 'Artist',
  albumName: 'Album',
  duration: 'PT1M',
  isAvailable: true,
};
const two = { ...one, trackId: 'two', name: 'Two' };
const three = { ...one, trackId: 'three', name: 'Three' };
const controller = {
  stop: vi.fn(),
  load: vi.fn(),
  play: vi.fn(),
  pause: vi.fn(),
  seekTo: vi.fn(),
  getCurrentTime: () => 0,
  getDuration: () => 0,
  setVolume: vi.fn(),
  getVolume: () => 100,
  isMuted: () => false,
};
beforeEach(() => {
  setController(controller);
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
  clearPlayer();
  setController(null);
  vi.restoreAllMocks();
});
it('removes earlier and duplicate entries while preserving unrelated playback', () => {
  setQueue([one, two, one, three], 3);
  setTime(32);
  setPlaybackStatus('playing');
  vi.clearAllMocks();
  removeQueueSong('one');
  expect(getPlayerState()).toMatchObject({
    queue: [two, three],
    currentIndex: 1,
    currentTime: 32,
    status: 'playing',
  });
  expect(controller.stop).not.toHaveBeenCalled();
  expect(controller.load).not.toHaveBeenCalled();
});
it('stops a deleted current song and defers loading the next until Play', () => {
  setQueue([one, two, one, three], 0);
  vi.clearAllMocks();
  removeQueueSong('one');
  expect(getPlayerState()).toMatchObject({
    queue: [two, three],
    currentIndex: 0,
    currentTime: 0,
    status: 'idle',
  });
  expect(controller.stop).toHaveBeenCalledOnce();
  expect(controller.load).not.toHaveBeenCalled();
  expect(controller.play).not.toHaveBeenCalled();
  play();
  expect(controller.load).toHaveBeenCalledWith(two);
  expect(controller.play).toHaveBeenCalledOnce();
});
it('clears an emptied queue and selects the previous entry when the last is deleted', () => {
  setQueue([two, one], 1);
  removeQueueSong('one');
  expect(getPlayerState()).toMatchObject({
    queue: [two],
    currentIndex: 0,
    status: 'idle',
  });
  removeQueueSong('two');
  expect(getPlayerState()).toMatchObject({
    queue: [],
    currentIndex: 0,
    status: 'idle',
  });
});
it('cancels without deleting and initially focuses Cancel', async () => {
  const remove = vi.spyOn(api, 'deleteSong');
  const close = vi.fn();
  const view = render(DeleteSongDialog, { song: one, onclose: close });
  await waitFor(() =>
    expect(view.getByRole('button', { name: 'Cancel' })).toHaveFocus(),
  );
  await fireEvent.click(view.getByRole('button', { name: 'Cancel' }));
  expect(close).toHaveBeenCalledOnce();
  expect(remove).not.toHaveBeenCalled();
});
it('keeps errors retryable and accepts an empty 204 response', async () => {
  setQueue([one, two], 0);
  const remove = vi
    .spyOn(api, 'deleteSong')
    .mockRejectedValueOnce(new Error('Try again'))
    .mockResolvedValueOnce(null);
  const close = vi.fn();
  const view = render(DeleteSongDialog, { song: one, onclose: close });
  await fireEvent.click(view.getByRole('button', { name: 'Delete song' }));
  await waitFor(() =>
    expect(view.getByRole('alert')).toHaveTextContent('Try again'),
  );
  expect(getPlayerState().queue).toHaveLength(2);
  expect(close).not.toHaveBeenCalled();
  await fireEvent.click(view.getByRole('button', { name: 'Delete song' }));
  await waitFor(() => expect(close).toHaveBeenCalledOnce());
  expect(remove).toHaveBeenCalledTimes(2);
  expect(getPlayerState().queue).toEqual([two]);
});
it('disables duplicate submission while pending', async () => {
  let resolve!: (value: null) => void;
  const remove = vi.spyOn(api, 'deleteSong').mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const view = render(DeleteSongDialog, { song: one, onclose: vi.fn() });
  await fireEvent.click(view.getByRole('button', { name: 'Delete song' }));
  expect(view.getByRole('button', { name: 'Deleting…' })).toBeDisabled();
  expect(view.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  expect(remove).toHaveBeenCalledOnce();
  resolve(null);
  await waitFor(() =>
    expect(view.queryByRole('button', { name: 'Deleting…' })).toBeNull(),
  );
});
it('applies cross-tab deletion outside the library page', async () => {
  setQueue([one, two], 0);
  const stop = listenForSongDeletions();
  const seen = vi.fn();
  const off = onSongDeleted(seen);
  window.dispatchEvent(
    new StorageEvent('storage', {
      key: 'orpheus:song-deleted',
      newValue: JSON.stringify({ trackId: 'one' }),
    }),
  );
  await waitFor(() => expect(getPlayerState().queue).toEqual([two]));
  expect(seen).toHaveBeenCalledWith('one');
  stop();
  off();
});
it('publishes deletion before asynchronous cache invalidation', async () => {
  const seen = vi.fn();
  const off = onSongDeleted(seen);
  const done = songDeleted('one');
  expect(seen).toHaveBeenCalledWith('one');
  await done;
  expect(
    JSON.parse(localStorage.getItem('orpheus:song-deleted')!),
  ).toMatchObject({ trackId: 'one' });
  off();
});
it('opens deletion from the actions menu and fences older pending loads', async () => {
  vi.spyOn(api, 'songs').mockResolvedValue({
    songs: [one, two],
    nextCursor: null,
    hasMore: false,
  });
  const view = render(Library);
  await waitFor(() =>
    expect(view.getByRole('button', { name: 'Actions for One' })).toBeVisible(),
  );
  await fireEvent.click(view.getByRole('button', { name: 'Actions for One' }));
  await fireEvent.click(
    await view.findByRole('menuitem', { name: 'Delete song' }),
  );
  expect(view.getByRole('dialog')).toBeVisible();
  let resolve!: (value: {
    songs: (typeof one)[];
    nextCursor: null;
    hasMore: boolean;
  }) => void;
  vi.mocked(api.songs).mockReturnValueOnce(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const { library } = await import('../src/lib/state.svelte');
  library.version++;
  await waitFor(() => expect(api.songs).toHaveBeenCalledTimes(2));
  vi.mocked(api.songs).mockResolvedValue({
    songs: [two],
    nextCursor: null,
    hasMore: false,
  });
  await songDeleted('one');
  resolve({ songs: [one, two], nextCursor: null, hasMore: false });
  await waitFor(() =>
    expect(view.getByRole('button', { name: 'Actions for Two' })).toBeVisible(),
  );
  expect(view.queryByRole('button', { name: 'Actions for One' })).toBeNull();
});
