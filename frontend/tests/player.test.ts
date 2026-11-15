import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import Player from '../src/lib/components/Player.svelte';
import { ui } from '../src/lib/state.svelte';
import {
  clearPlayer,
  getPlayerState,
  setController,
  setQueue,
  setTime,
  setPlaybackStatus,
} from '../src/lib/core/player-store.svelte';

const controller = {
  load: vi.fn(),
  play: vi.fn(),
  pause: vi.fn(),
  stop: vi.fn(),
  seekTo: vi.fn(),
  getCurrentTime: () => 0,
  getDuration: () => 0,
  setVolume: vi.fn(),
  getVolume: () => 100,
  isMuted: () => false,
};
beforeEach(() => {
  vi.mocked(window.matchMedia).mockImplementation((query) => ({
    // jsdom has no Web Animations API; motion is checked in the browser.
    matches:
      query.includes('max-width: 767px') ||
      query.includes('prefers-reduced-motion'),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
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
  setPlaybackStatus('playing');
  ui.nowPlaying = true;
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
  ui.playerPaneCollapsed = false;
  ui.nowPlaying = false;
  clearPlayer();
  setController(null);
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
  await waitFor(() => expect(ui.nowPlaying).toBe(false));
  expect(getPlayerState().currentTime).toBe(90);
  expect(controller.pause).not.toHaveBeenCalled();
  expect(controller.stop).not.toHaveBeenCalled();
  expect(controller.load).not.toHaveBeenCalled();
  await fireEvent.click(
    view.getByRole('button', { name: 'Open Now Playing: Somebody' }),
  );
  await waitFor(() => expect(ui.nowPlaying).toBe(true));
  const close = view.getByRole('button', { name: 'Close player' });
  expect(
    close.closest('.now-playing-header')?.querySelector('[role="tablist"]'),
  ).not.toBeNull();
  await fireEvent.click(close);
  await waitFor(() => expect(ui.nowPlaying).toBe(false));
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
  vi.mocked(window.matchMedia).mockImplementation((query) =>
    query.includes('min-width: 1000px')
      ? media
      : {
          ...media,
          matches: query.includes('prefers-reduced-motion'),
          addEventListener: vi.fn(),
        },
  );
  ui.nowPlaying = false;
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
  media.matches = false;
  change?.();
  await waitFor(() => expect(view.getByRole('dialog')).toBeVisible());
  await fireEvent.click(view.getByRole('button', { name: 'Close player' }));
  expect(view.getByRole('contentinfo')).toBeVisible();
  media.matches = true;
  change?.();
  await waitFor(() => expect(view.getByRole('complementary')).toBeVisible());
  ui.videoDockedLayout = true;
  media.matches = false;
  change?.();
  await waitFor(() => expect(view.getByRole('complementary')).toBeVisible());
  ui.videoDockedLayout = null;
  await waitFor(() => expect(view.getByRole('contentinfo')).toBeVisible());
  expect(getPlayerState().currentTime).toBe(90);
  expect(controller.load).not.toHaveBeenCalled();
  expect(controller.stop).not.toHaveBeenCalled();
  expect(controller.pause).not.toHaveBeenCalled();
});

it('opens Now Playing from the player-bar background and seeks without expanding it', async () => {
  ui.nowPlaying = false;
  const view = render(Player);
  const seek = view.getByRole('slider', {
    name: 'Seek playback in mini-player',
  });
  await fireEvent.input(seek, { target: { value: '45' } });
  expect(getPlayerState().currentTime).toBe(45);
  expect(ui.nowPlaying).toBe(false);
  await fireEvent.click(
    view.getByRole('button', { name: 'Expand Now Playing' }),
  );
  expect(ui.nowPlaying).toBe(true);
});

it.each([true, false])(
  'shows loading in seek tracks and restores seeking when ready (expanded: %s)',
  async (expanded) => {
    ui.nowPlaying = expanded;
    setPlaybackStatus('loading');
    const view = render(Player);
    const labels = expanded
      ? ['Seek in Now Playing']
      : ['Seek playback', 'Seek playback in mini-player'];
    expect(view.getByRole('status')).toHaveTextContent('Loading audio');
    const sliders = labels.map((name) => view.getByRole('slider', { name }));
    for (const slider of sliders) {
      expect(slider).toBeDisabled();
      expect(slider).toHaveAttribute('aria-busy', 'true');
    }
    setPlaybackStatus('playing');
    await waitFor(() => {
      expect(view.getByRole('status').textContent).toBe('');
      for (const slider of sliders) {
        expect(slider).toBeEnabled();
        expect(slider).toHaveAttribute('aria-busy', 'false');
      }
    });
    expect(view.getByRole('slider', { name: labels[0] })).toBe(sliders[0]);
    await fireEvent.input(sliders[0], { target: { value: '45' } });
    expect(controller.seekTo).toHaveBeenCalledWith(45);
    setPlaybackStatus('loading');
    await waitFor(() => expect(sliders[0]).toBeDisabled());
    setPlaybackStatus('paused');
    await waitFor(() => expect(sliders[0]).toBeEnabled());
  },
);
