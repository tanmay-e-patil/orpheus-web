import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import { get } from 'svelte/store';
import Player from '../src/lib/components/Player.svelte';
import { nowPlaying, playback, playerPaneCollapsed } from '../src/lib/state';
import {
  clearPlayer,
  getPlayerState,
  setController,
  setQueue,
  setTime,
} from '../src/lib/core/player-store.js';

const controller = {
  load: vi.fn(),
  play: vi.fn(),
  pause: vi.fn(),
  stop: vi.fn(),
  setVolume: vi.fn(),
};
let unsubscribe: () => void;
beforeEach(() => {
  vi.mocked(window.matchMedia).mockImplementation((query) => ({
    matches: query.includes('max-width: 767px'),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
  unsubscribe = playback.subscribe(() => {});
  setController(controller);
  setQueue(
    [
      {
        trackId: 'one',
        name: 'Somebody',
        artistName: 'Dagny',
        albumName: 'Strangers / Lovers',
        isAvailable: true,
        duration: 'PT3M12S',
        lyrics: 'Somebody',
        syncedLyrics: '[00:00.00]Somebody',
      },
    ],
    0,
  );
  setTime(90);
  nowPlaying.set(true);
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
  playerPaneCollapsed.set(false);
  nowPlaying.set(false);
  clearPlayer();
  setController(null);
  unsubscribe();
});
it('closes by swipe without interrupting audio and supports reopening and tapping the chevron', async () => {
  const view = render(Player);
  const sheet = await waitFor(() => {
    const element = document.querySelector<HTMLElement>('.now-playing-sheet');
    expect(element).not.toBeNull();
    return element!;
  });
  Object.defineProperty(sheet, 'clientHeight', { value: 800 });
  const artwork = sheet.querySelector<HTMLElement>('.now-playing-media')!;
  for (const [type, y, time] of [
    ['pointerdown', 100, 0],
    ['pointermove', 300, 600],
    ['pointerup', 300, 610],
  ] as const) {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperties(event, {
      pointerId: { value: 1 },
      pointerType: { value: 'touch' },
      isPrimary: { value: true },
      clientX: { value: 100 },
      clientY: { value: y },
      timeStamp: { value: time },
    });
    artwork.dispatchEvent(event);
  }
  await waitFor(() => expect(get(nowPlaying)).toBe(false));
  expect(getPlayerState().currentTime).toBe(90);
  expect(controller.pause).not.toHaveBeenCalled();
  expect(controller.stop).not.toHaveBeenCalled();
  expect(controller.load).not.toHaveBeenCalled();
  await fireEvent.click(
    view.getByRole('button', { name: 'Open Now Playing: Somebody' }),
  );
  await waitFor(() => expect(get(nowPlaying)).toBe(true));
  const close = view.getByRole('button', { name: 'Close player' });
  expect(
    close.closest('.now-playing-header')?.querySelector('[role="tablist"]'),
  ).not.toBeNull();
  await fireEvent.click(close);
  await waitFor(() => expect(get(nowPlaying)).toBe(false));
  expect(controller.pause).not.toHaveBeenCalled();
});

it('docks automatically, collapses, and adapts to rotation without reloading audio', async () => {
  let change: (() => void) | undefined;
  const media = {
    matches: true,
    media: '(min-width: 1000px) and (orientation: landscape)',
    onchange: null,
    addEventListener: vi.fn((_event, listener) => {
      change = listener;
    }),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  };
  vi.mocked(window.matchMedia).mockImplementation(() => media);
  nowPlaying.set(false);
  const view = render(Player);
  await waitFor(() =>
    expect(
      view.getByRole('complementary', { name: 'Now Playing' }),
    ).toBeVisible(),
  );
  expect(view.queryByRole('contentinfo')).toBeNull();
  expect(view.queryByRole('dialog')).toBeNull();
  await fireEvent.click(
    view.getByRole('button', { name: 'Collapse Now Playing' }),
  );
  expect(view.getByRole('contentinfo', { name: 'Music player' })).toBeVisible();
  await fireEvent.click(
    view.getByRole('button', { name: 'Open Now Playing: Somebody' }),
  );
  await waitFor(() => expect(view.getByRole('complementary')).toBeVisible());
  // Explicit expansion remains expanded when the viewport becomes portrait.
  media.matches = false;
  change?.();
  await waitFor(() => expect(view.getByRole('dialog')).toBeVisible());
  await fireEvent.click(view.getByRole('button', { name: 'Close player' }));
  expect(view.getByRole('contentinfo')).toBeVisible();
  media.matches = true;
  change?.();
  await waitFor(() => expect(view.getByRole('complementary')).toBeVisible());
  expect(getPlayerState().currentTime).toBe(90);
  expect(controller.load).not.toHaveBeenCalled();
  expect(controller.stop).not.toHaveBeenCalled();
  expect(controller.pause).not.toHaveBeenCalled();
});
