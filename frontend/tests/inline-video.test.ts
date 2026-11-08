import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import InlineVideo from '../src/lib/components/InlineVideo.svelte';
import {
  clearPlayer,
  getPlayerState,
  setController,
  setQueue,
} from '../src/lib/core/player-store.svelte';
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

const iPhoneUserAgent =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1';

it('prepares iPhone YouTube for native fullscreen without hidden seeks or playback', async () => {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(iPhoneUserAgent);
  vi.useFakeTimers();
  render(InlineVideo, { id: 'video-one', active: false, onerror: vi.fn() });
  await vi.advanceTimersByTimeAsync(0);
  expect(fixture.options).not.toBeNull();
  fixture.options.events.onReady();
  await vi.advanceTimersByTimeAsync(10000);
  expect(fixture.options.playerVars.playsinline).toBe(0);
  expect(fixture.options.playerVars.autoplay).toBe(0);
  expect(fixture.player.seekTo).not.toHaveBeenCalled();
  expect(fixture.player.playVideo).not.toHaveBeenCalled();
  expect(fixture.player.pauseVideo).not.toHaveBeenCalled();
  expect(audio.pause).not.toHaveBeenCalled();
  expect(getPlayerState().controller).toBe(audio);
});

it('starts iPhone native playback from activation without requesting div fullscreen', async () => {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(iPhoneUserAgent);
  const view = await prepared();
  const request = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(
    view.container.querySelector('.inline-video')!,
    'requestFullscreen',
    { value: request },
  );
  view.component.activate(true);
  expect(fixture.player.seekTo).toHaveBeenCalledWith(12, true);
  expect(fixture.player.unMute).toHaveBeenCalledOnce();
  expect(fixture.player.playVideo).toHaveBeenCalledOnce();
  await view.rerender({ active: true });
  expect(request).not.toHaveBeenCalled();
  expect(audio.pause).not.toHaveBeenCalled();
  fixture.options.events.onStateChange({ data: 1 });
  expect(audio.pause).toHaveBeenCalledOnce();
  await view.rerender({ active: false });
  expect(audio.play).toHaveBeenCalledOnce();
  expect(fixture.player.pauseVideo).toHaveBeenCalledOnce();
  expect(getPlayerState().controller).toBe(audio);
});

it('keeps audio playing and retries native iPhone playback when a fresh gesture is required', async () => {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(iPhoneUserAgent);
  const view = await prepared();
  view.component.activate(true);
  await view.rerender({ active: true });
  fixture.options.events.onAutoplayBlocked();
  await tick();
  expect(audio.pause).not.toHaveBeenCalled();
  expect(getPlayerState().controller).toBe(audio);
  await fireEvent.click(view.getByRole('button', { name: 'Play video' }));
  expect(fixture.player.playVideo).toHaveBeenCalledTimes(2);
  fixture.options.events.onStateChange({ data: 1 });
  expect(getPlayerState().status).toBe('playing');
});

it('uses one fullscreen owner and exits without pausing or reloading the video', async () => {
  const view = await prepared();
  const container = view.container.querySelector<HTMLElement>('.inline-video')!;
  const descriptors = ['fullscreenElement', 'exitFullscreen'].map(
    (key) => [key, Object.getOwnPropertyDescriptor(document, key)] as const,
  );
  let current: Element | null = null;
  const changed = () => document.dispatchEvent(new Event('fullscreenchange'));
  const request = vi.fn(() => {
    current = container;
    changed();
    return Promise.resolve();
  });
  const exit = vi.fn(() => {
    current = null;
    changed();
    return Promise.resolve();
  });
  Object.defineProperty(container, 'requestFullscreen', { value: request });
  Object.defineProperty(document, 'fullscreenElement', {
    configurable: true,
    get: () => current,
  });
  Object.defineProperty(document, 'exitFullscreen', {
    configurable: true,
    value: exit,
  });
  try {
    view.component.activate(true);
    await view.rerender({ active: true });
    await waitFor(() => expect(request).toHaveBeenCalledOnce());
    expect(fixture.options.playerVars.fs).toBe(0);
    fixture.options.events.onStateChange({ data: 1 });
    const controller = getPlayerState().controller;
    vi.clearAllMocks();
    await fireEvent.click(
      view.getByRole('button', { name: 'Exit fullscreen' }),
    );
    expect(exit).toHaveBeenCalledOnce();
    expect(current).toBeNull();
    expect(getPlayerState().controller).toBe(controller);
    expect(getPlayerState().status).toBe('playing');
    expect(fixture.player.pauseVideo).not.toHaveBeenCalled();
    expect(fixture.player.destroy).not.toHaveBeenCalled();
    await fireEvent.click(
      view.getByRole('button', { name: 'Enter fullscreen' }),
    );
    await waitFor(() => expect(request).toHaveBeenCalledOnce());
    current = null;
    changed();
    await tick();
    expect(
      view.getByRole('button', { name: 'Enter fullscreen' }),
    ).toBeVisible();
  } finally {
    await view.rerender({ active: false });
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(document, key, descriptor);
      else Reflect.deleteProperty(document, key);
    }
  }
});

it('keeps iPhone fullscreen owned by the native YouTube video controls', async () => {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(iPhoneUserAgent);
  const view = await prepared();
  view.component.activate(true);
  await view.rerender({ active: true });
  expect(fixture.options.playerVars.fs).toBe(1);
  expect(fixture.options.playerVars.playsinline).toBe(0);
  expect(view.queryByRole('button', { name: 'Enter fullscreen' })).toBeNull();
});

it('requests landscape only after mobile HTML fullscreen enters and releases it on exit', async () => {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
    'Mozilla/5.0 (Linux; Android 15) Chrome/140.0 Mobile Safari/537.36',
  );
  const orientationDescriptor = Object.getOwnPropertyDescriptor(
    screen,
    'orientation',
  );
  const fullscreenDescriptor = Object.getOwnPropertyDescriptor(
    document,
    'fullscreenElement',
  );
  const lock = vi.fn().mockResolvedValue(undefined),
    unlock = vi.fn();
  Object.defineProperty(screen, 'orientation', {
    configurable: true,
    value: { lock, unlock },
  });
  let current: Element | null = null;
  Object.defineProperty(document, 'fullscreenElement', {
    configurable: true,
    get: () => current,
  });
  const view = await prepared();
  const container = view.container.querySelector<HTMLElement>('.inline-video')!;
  const request = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(container, 'requestFullscreen', { value: request });
  try {
    view.component.activate(true);
    await view.rerender({ active: true });
    await waitFor(() => expect(request).toHaveBeenCalledOnce());
    expect(lock).not.toHaveBeenCalled();
    current = container;
    document.dispatchEvent(new Event('fullscreenchange'));
    await tick();
    expect(lock).toHaveBeenCalledExactlyOnceWith('landscape');
    current = null;
    document.dispatchEvent(new Event('fullscreenchange'));
    await tick();
    expect(unlock).toHaveBeenCalledOnce();
  } finally {
    await view.rerender({ active: false });
    if (orientationDescriptor)
      Object.defineProperty(screen, 'orientation', orientationDescriptor);
    else Reflect.deleteProperty(screen, 'orientation');
    if (fullscreenDescriptor)
      Object.defineProperty(
        document,
        'fullscreenElement',
        fullscreenDescriptor,
      );
    else Reflect.deleteProperty(document, 'fullscreenElement');
  }
});

it('recognizes an iPad using the desktop user agent and never seeks hidden video', async () => {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15',
  );
  vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');
  Object.defineProperty(navigator, 'maxTouchPoints', {
    configurable: true,
    get: () => 0,
  });
  vi.spyOn(navigator, 'maxTouchPoints', 'get').mockReturnValue(5);
  vi.useFakeTimers();
  render(InlineVideo, { id: 'video-one', active: false, onerror: vi.fn() });
  await vi.advanceTimersByTimeAsync(0);
  fixture.options.events.onReady();
  await vi.advanceTimersByTimeAsync(10000);
  expect(fixture.player.seekTo).not.toHaveBeenCalled();
  expect(fixture.player.playVideo).not.toHaveBeenCalled();
  expect(fixture.options.playerVars.playsinline).toBe(1);
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
