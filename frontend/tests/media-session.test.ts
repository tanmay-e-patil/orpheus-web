import { afterEach, expect, it, vi } from 'vitest';

class AudioFixture extends EventTarget {
  static instance: AudioFixture;
  src = '';
  preload = '';
  currentTime = 0;
  duration = 180;
  paused = true;
  ended = false;
  volume = 1;
  muted = false;
  constructor() {
    super();
    AudioFixture.instance = this;
  }
  play = vi.fn(() => {
    this.paused = false;
    this.ended = false;
    this.dispatchEvent(new Event('playing'));
    return Promise.resolve();
  });
  pause() {
    this.paused = true;
    this.dispatchEvent(new Event('pause'));
  }
  load() {
    this.currentTime = 0;
    this.dispatchEvent(new Event('loadstart'));
  }
  removeAttribute() {
    this.src = '';
  }
}

const songs = ['one', 'two'].map((trackId) => ({
  trackId,
  name: trackId,
  artistName: 'Artist',
  albumName: 'Album',
  albumArt: 'https://example.com/art.jpg',
  duration: 'PT3M',
  isAvailable: true,
}));

async function setup({ supported = true, rejectOptional = false } = {}) {
  vi.resetModules();
  const handlers = new Map<string, MediaSessionActionHandler>();
  const session = {
    metadata: null as MediaMetadata | null,
    playbackState: 'none',
    setActionHandler: vi.fn(
      (action: string, handler: MediaSessionActionHandler) => {
        if (rejectOptional && action === 'seekto')
          throw new Error('Unsupported');
        handlers.set(action, handler);
      },
    ),
    setPositionState: vi.fn(),
  };
  const audioSession = { type: 'auto' };
  if (rejectOptional) {
    Object.defineProperty(audioSession, 'type', {
      set() {
        throw new Error('Unsupported');
      },
    });
    session.setPositionState.mockImplementation(() => {
      throw new Error('Unsupported');
    });
  }
  vi.stubGlobal(
    'navigator',
    supported ? { mediaSession: session, audioSession } : {},
  );
  vi.stubGlobal(
    'MediaMetadata',
    class {
      constructor(data: MediaMetadataInit) {
        Object.assign(this, data);
      }
    },
  );
  vi.stubGlobal('Audio', AudioFixture);
  // Simulate a locked screen: animation callbacks never run.
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn(() => 1),
  );
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  const store = await import('../src/lib/core/player-store.svelte');
  const { initAudioPlayer } = await import('../src/lib/core/audio-player');
  const { flushSync: flush } = await import('svelte');
  initAudioPlayer();
  store.setQueue(songs, 0);
  flush();
  return {
    flush,
    store,
    audio: AudioFixture.instance,
    session,
    audioSession,
    handlers,
  };
}

afterEach(() => vi.unstubAllGlobals());

it('declares music playback and exposes metadata, progress, and lock-screen controls', async () => {
  const { flush, store, audio, session, audioSession, handlers } =
    await setup();
  expect(audioSession.type).toBe('playback');
  expect(session.metadata).toMatchObject({
    title: 'one',
    artist: 'Artist',
    album: 'Album',
    artwork: [{ src: songs[0].albumArt }],
  });
  expect(session.playbackState).toBe('playing');
  audio.currentTime = 42;
  audio.dispatchEvent(new Event('timeupdate'));
  flush();
  expect(session.setPositionState).toHaveBeenLastCalledWith({
    duration: 180,
    position: 42,
    playbackRate: 1,
  });
  handlers.get('pause')!({ action: 'pause' });
  flush();
  expect(audio.paused).toBe(true);
  expect(session.playbackState).toBe('paused');
  handlers.get('play')!({ action: 'play' });
  expect(audio.paused).toBe(false);
  handlers.get('seekto')!({ action: 'seekto', seekTime: 80 });
  expect(audio.currentTime).toBe(80);
  handlers.get('seekforward')!({ action: 'seekforward', seekOffset: 500 });
  expect(audio.currentTime).toBe(180);
  handlers.get('seekbackward')!({ action: 'seekbackward', seekOffset: 500 });
  expect(audio.currentTime).toBe(0);
  handlers.get('nexttrack')!({ action: 'nexttrack' });
  flush();
  expect(session.metadata?.title).toBe('two');
  handlers.get('previoustrack')!({ action: 'previoustrack' });
  flush();
  expect(session.metadata?.title).toBe('one');
  store.clearPlayer();
  flush();
  expect(session.metadata).toBeNull();
  expect(session.playbackState).toBe('none');
  expect(session.setPositionState).toHaveBeenLastCalledWith();
});

it('advances the queue with the same audio element while animation frames are suspended', async () => {
  const { flush, store, audio, session } = await setup();
  audio.ended = true;
  audio.dispatchEvent(new Event('ended'));
  flush();
  expect(store.currentSong()?.trackId).toBe('two');
  expect(AudioFixture.instance).toBe(audio);
  expect(audio.src).toBe('/api/songs/two/audio');
  expect(audio.play).toHaveBeenCalledTimes(2);
  expect(session.metadata?.title).toBe('two');
  audio.ended = true;
  audio.dispatchEvent(new Event('ended'));
  flush();
  expect(store.getPlayerState().status).toBe('ended');
  expect(session.playbackState).toBe('none');
});

it('keeps playing when media session APIs are absent', async () => {
  const { audio, store } = await setup({ supported: false });
  expect(audio.paused).toBe(false);
  expect(store.getPlayerState().status).toBe('playing');
});

it('keeps playing when optional audio session, position, or action APIs reject calls', async () => {
  const { audio, handlers } = await setup({ rejectOptional: true });
  expect(audio.paused).toBe(false);
  handlers.get('pause')!({ action: 'pause' });
  expect(audio.paused).toBe(true);
});

it('routes lock-screen controls to the current controller after a video handoff', async () => {
  const { store, audio, handlers } = await setup();
  audio.pause();
  const video = {
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
  store.setController(video);
  handlers.get('play')!({ action: 'play' });
  handlers.get('seekto')!({ action: 'seekto', seekTime: 55 });
  expect(video.play).toHaveBeenCalledOnce();
  expect(video.seekTo).toHaveBeenCalledWith(55);
  expect(audio.paused).toBe(true);
});
