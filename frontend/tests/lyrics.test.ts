import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import Lyrics from '../src/lib/components/Lyrics.svelte';
import {
  clearPlayer,
  getPlayerState,
  next,
  setQueue,
  setTime,
} from '../src/lib/core/player-store.svelte';
import type { Song } from '../src/lib/types';

const songs: Song[] = ['one', 'two'].map((trackId) => ({
  trackId,
  name: trackId,
  artistName: 'Artist',
  albumName: 'Album',
  duration: 'PT3M',
  isAvailable: true,
  lyrics: 'First line\nLast line',
  syncedLyrics: '[00:10.00]First line\n[02:30.00]Last line',
}));

afterEach(() => {
  cleanup();
  clearPlayer();
});

it('resets the previous song scroll during the next song intro', async () => {
  setQueue(songs, 0);
  setTime(160);
  const { container } = render(Lyrics);
  const scroller = container.querySelector<HTMLElement>('.lyrics-content')!;
  scroller.scrollTo = vi.fn();
  await waitFor(() => {
    expect(container.querySelector('.active')?.textContent).toBe('Last line');
  });
  scroller.scrollTop = 800;
  next();
  await waitFor(() => {
    expect(scroller.scrollTo).toHaveBeenCalledWith({
      top: 0,
      behavior: 'instant',
    });
    expect(container.querySelector('.active')).toBeNull();
  });
  setTime(10);
  await waitFor(() => {
    expect(container.querySelector('.active')?.textContent).toBe('First line');
  });
});

it('resets scrolling when seeking back before the first lyric', async () => {
  setQueue(songs, 0);
  setTime(160);
  const { container } = render(Lyrics);
  const scroller = container.querySelector<HTMLElement>('.lyrics-content')!;
  scroller.scrollTo = vi.fn();
  await waitFor(() => {
    expect(container.querySelector('.active')?.textContent).toBe('Last line');
  });
  scroller.scrollTop = 800;
  setTime(0);
  await waitFor(() => {
    expect(scroller.scrollTo).toHaveBeenCalledWith({
      top: 0,
      behavior: 'instant',
    });
  });
});

it('seeks the library player from the shared lyric display', async () => {
  setQueue(songs, 0);
  setTime(10);
  const view = render(Lyrics);
  await fireEvent.click(view.getByRole('button', { name: 'Last line' }));
  expect(getPlayerState().currentTime).toBe(150);
  await waitFor(() =>
    expect(view.getByRole('button', { name: 'Last line' })).toHaveAttribute(
      'aria-current',
      'true',
    ),
  );
});
