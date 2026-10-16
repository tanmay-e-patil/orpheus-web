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
vi.mock('../src/lib/youtube', () => ({
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
it('requests fullscreen after revealing video and exits when video closes', async () => {
  const view = await prepared();
  const container = view.container.querySelector<HTMLElement>('.inline-video')!;
  const request = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(container, 'requestFullscreen', { value: request });
  const fullscreenDescriptor = Object.getOwnPropertyDescriptor(
    document,
    'fullscreenElement',
  );
  const exitDescriptor = Object.getOwnPropertyDescriptor(
    document,
    'exitFullscreen',
  );
  const exit = vi.fn().mockResolvedValue(undefined);
  try {
    view.component.activate(true);
    await view.rerender({ active: true });
    await waitFor(() => expect(request).toHaveBeenCalledOnce());
    expect(fixture.player.playVideo).toHaveBeenCalledOnce();
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      value: container,
    });
    Object.defineProperty(document, 'exitFullscreen', {
      configurable: true,
      value: exit,
    });
    await view.rerender({ active: false });
    expect(exit).toHaveBeenCalledOnce();
    expect(getPlayerState().controller).toBe(audio);
  } finally {
    for (const [key, descriptor] of [
      ['fullscreenElement', fullscreenDescriptor],
      ['exitFullscreen', exitDescriptor],
    ] as const) {
      if (descriptor) Object.defineProperty(document, key, descriptor);
      else Reflect.deleteProperty(document, key);
    }
  }
});
it('continues playback when the browser rejects fullscreen', async () => {
  const view = await prepared();
  const request = vi.fn().mockRejectedValue(new Error('Fullscreen denied'));
  Object.defineProperty(
    view.container.querySelector('.inline-video')!,
    'requestFullscreen',
    { value: request },
  );
  view.component.activate(true);
  await view.rerender({ active: true });
  await waitFor(() => expect(request).toHaveBeenCalledOnce());
  fixture.options.events.onStateChange({ data: 1 });
  expect(getPlayerState().status).toBe('playing');
  expect(audio.pause).toHaveBeenCalledOnce();
});
