import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import InlineVideo from '../src/lib/components/InlineVideo.svelte';
import {
  clearPlayer,
  getPlayerState,
  setController,
  setQueue,
} from '../src/lib/core/player-store.js';
import type { PlaybackController } from '../src/lib/video-playback';

const fixture = vi.hoisted(() => ({
  options: null as any,
  constructors: vi.fn(),
  player: {
    destroy: vi.fn(),
    playVideo: vi.fn(),
    pauseVideo: vi.fn(),
    seekTo: vi.fn(),
    getCurrentTime: () => 12,
    getDuration: () => 180,
    setVolume: vi.fn(),
    getVolume: () => 65,
    isMuted: () => false,
    mute: vi.fn(),
    unMute: vi.fn(),
  },
}));
vi.mock('../src/lib/youtube', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/lib/youtube')>()),
  loadYouTube: () =>
    Promise.resolve({
      Player: class {
        constructor(_target: HTMLElement, options: unknown) {
          fixture.constructors();
          fixture.options = options;
          return fixture.player;
        }
      },
    }),
}));
let audio: PlaybackController;
beforeEach(() => {
  clearPlayer();
  vi.clearAllMocks();
  // jsdom lacks the top layer; actual geometry is checked in browser preview.
  HTMLElement.prototype.showPopover = vi.fn();
  HTMLElement.prototype.hidePopover = vi.fn();
  fixture.options = null;
  audio = {
    load: vi.fn(),
    play: vi.fn(),
    pause: vi.fn(),
    stop: vi.fn(),
    seekTo: vi.fn(),
    getCurrentTime: () => 12,
    getDuration: () => 180,
    getVolume: () => 65,
    setVolume: vi.fn(),
    isMuted: () => false,
  };
  setController(audio);
  setQueue(
    [
      {
        trackId: 'one',
        name: 'One',
        artistName: 'Artist',
        albumName: 'Album',
        isAvailable: true,
        duration: 'PT3M',
      },
    ],
    0,
  );
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
  clearPlayer();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
async function prepared() {
  const view = render(InlineVideo, {
    id: 'video-one',
    active: false,
    onerror: vi.fn(),
  });
  await waitFor(() => expect(fixture.options).not.toBeNull());
  fixture.options.events.onReady();
  return view;
}
it('prepares the iframe while audio is playing without taking over transport', async () => {
  await prepared();
  expect(fixture.options.videoId).toBe('video-one');
  expect(fixture.options.playerVars.autoplay).toBe(0);
  expect(fixture.options.playerVars.playsinline).toBe(1);
  expect(getPlayerState().controller).toBe(audio);
  expect(audio.pause).not.toHaveBeenCalled();
  expect(fixture.player.playVideo).not.toHaveBeenCalled();
  expect(fixture.player.seekTo).toHaveBeenCalledWith(0, true);
  expect(fixture.player.pauseVideo).toHaveBeenCalled();
});
it('plays synchronously from activation and reuses the iframe across tab switches', async () => {
  const view = await prepared();
  view.component.activate();
  expect(fixture.player.unMute).toHaveBeenCalledOnce();
  expect(fixture.player.playVideo).toHaveBeenCalledOnce();
  await view.rerender({ active: true });
  fixture.options.events.onStateChange({ data: 1 });
  expect(audio.pause).toHaveBeenCalledOnce();
  await view.rerender({ active: false });
  expect(getPlayerState().controller).toBe(audio);
  expect(audio.play).toHaveBeenCalledOnce();
  expect(fixture.player.destroy).not.toHaveBeenCalled();
  view.component.activate();
  await view.rerender({ active: true });
  expect(fixture.player.playVideo).toHaveBeenCalledTimes(2);
  expect(fixture.constructors).toHaveBeenCalledOnce();
});
it('retains audio and offers a gesture retry if autoplay is blocked', async () => {
  const view = await prepared();
  view.component.activate();
  await view.rerender({ active: true });
  fixture.options.events.onAutoplayBlocked();
  await tick();
  expect(getPlayerState().controller).toBe(audio);
  expect(audio.pause).not.toHaveBeenCalled();
  await fireEvent.click(view.getByRole('button', { name: 'Play video' }));
  expect(fixture.player.playVideo).toHaveBeenCalledTimes(2);
  fixture.options.events.onStateChange({ data: 1 });
  expect(audio.pause).toHaveBeenCalledOnce();
});
it('expands without browser fullscreen and restores without interrupting playback', async () => {
  const view = await prepared();
  const container = view.container.querySelector<HTMLElement>('.inline-video')!;
  const show = vi.fn(),
    hide = vi.fn(),
    request = vi.fn();
  container.showPopover = show;
  container.hidePopover = hide;
  container.requestFullscreen = request;
  document.documentElement.style.overflow = 'auto';
  view.component.activate(true);
  await view.rerender({ active: true });
  expect(container).toHaveClass('inline-video-expanded');
  expect(show).toHaveBeenCalledOnce();
  expect(request).not.toHaveBeenCalled();
  expect(document.documentElement.style.overflow).toBe('hidden');
  expect(fixture.options.playerVars.playsinline).toBe(1);
  expect(fixture.options.playerVars.fs).toBe(0);
  fixture.options.events.onStateChange({ data: 1 });
  const controller = getPlayerState().controller;
  vi.clearAllMocks();
  await fireEvent.click(view.getByRole('button', { name: 'Restore video' }));
  expect(container).not.toHaveClass('inline-video-expanded');
  expect(hide).toHaveBeenCalledOnce();
  expect(document.documentElement.style.overflow).toBe('auto');
  expect(getPlayerState().controller).toBe(controller);
  expect(fixture.player.pauseVideo).not.toHaveBeenCalled();
  expect(fixture.player.destroy).not.toHaveBeenCalled();
  await fireEvent.click(view.getByRole('button', { name: 'Expand video' }));
  expect(container).toHaveClass('inline-video-expanded');
  await fireEvent.keyDown(document, { key: 'Escape' });
  expect(container).not.toHaveClass('inline-video-expanded');
  expect(fixture.player.pauseVideo).not.toHaveBeenCalled();
  document.documentElement.style.overflow = '';
});

it.each([
  'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Version/26.0 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (iPad; CPU OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Version/26.0 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (iPad; CPU OS 26_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/154.0.0.0 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/26.0 Safari/605.1.15',
])(
  'keeps Apple mobile playback inline and expands without hidden media seeks (%s)',
  async (userAgent) => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent);
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');
    Object.defineProperty(navigator, 'maxTouchPoints', {
      configurable: true,
      get: () => 5,
    });
    vi.useFakeTimers();
    const view = render(InlineVideo, {
      id: 'video-one',
      active: false,
      onerror: vi.fn(),
    });
    await vi.advanceTimersByTimeAsync(0);
    fixture.options.events.onReady();
    await vi.advanceTimersByTimeAsync(10000);
    expect(fixture.player.seekTo).not.toHaveBeenCalled();
    expect(fixture.player.playVideo).not.toHaveBeenCalled();
    expect(fixture.options.playerVars.playsinline).toBe(1);
    expect(fixture.options.playerVars.fs).toBe(0);
    view.component.activate(true);
    await view.rerender({ active: true });
    expect(view.container.querySelector('.inline-video')).toHaveClass(
      'inline-video-expanded',
    );
    await view.rerender({ active: false });
    expect(view.container.querySelector('.inline-video')).not.toHaveClass(
      'inline-video-expanded',
    );
    expect(document.documentElement.style.overflow).not.toBe('hidden');
  },
);

it('cleans up expansion and restores scrolling when unmounted', async () => {
  const view = await prepared();
  view.component.activate(true);
  await view.rerender({ active: true });
  expect(document.documentElement.style.overflow).toBe('hidden');
  view.unmount();
  expect(document.documentElement.style.overflow).not.toBe('hidden');
  expect(fixture.player.destroy).toHaveBeenCalledOnce();
});

it('reports a specific YouTube error once, keeps audio, and creates a fresh player on retry', async () => {
  const onerror = vi.fn();
  const view = render(InlineVideo, { id: 'video-one', active: false, onerror });
  await waitFor(() => expect(fixture.options).not.toBeNull());
  fixture.options.events.onReady();
  view.component.activate();
  await view.rerender({ active: true });
  const oldEvents = fixture.options.events;
  oldEvents.onError({ data: 150 });
  oldEvents.onError({ data: 150 });
  oldEvents.onError({ data: 150 });
  await tick();
  expect(onerror).toHaveBeenCalledOnce();
  expect(onerror).toHaveBeenCalledWith(
    expect.stringContaining('does not allow embedded playback'),
  );
  expect(getPlayerState().controller).toBe(audio);
  expect(view.getByRole('alert')).toHaveTextContent('YouTube error 150');
  await fireEvent.click(view.getByRole('button', { name: 'Retry video' }));
  await waitFor(() => expect(fixture.constructors).toHaveBeenCalledTimes(2));
  oldEvents.onError({ data: 150 });
  expect(onerror).toHaveBeenCalledOnce();
  fixture.options.events.onReady();
  fixture.options.events.onStateChange({ data: 1 });
  expect(audio.pause).toHaveBeenCalledOnce();
  expect(getPlayerState().status).toBe('playing');
  expect(view.queryByRole('alert')).toBeNull();
});
