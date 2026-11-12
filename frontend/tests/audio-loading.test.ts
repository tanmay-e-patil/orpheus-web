import { afterEach, beforeEach, expect, it, vi } from 'vitest';

class AudioFixture extends EventTarget {
  static instance: AudioFixture;
  currentTime = 0;
  duration = 180;
  paused = true;
  ended = false;
  seeking = false;
  readyState = 0;
  src = '';
  volume = 1;
  muted = false;
  preload = '';
  constructor() {
    super();
    AudioFixture.instance = this;
  }
  play() {
    this.paused = false;
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
    this.dispatchEvent(new Event('pause'));
  }
  load() {
    this.currentTime = 0;
    this.readyState = 0;
  }
  removeAttribute() {
    this.src = '';
  }
}

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal('Audio', AudioFixture);
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn(() => 1),
  );
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
});
afterEach(() => vi.unstubAllGlobals());

async function start() {
  const store = await import('../src/lib/core/player-store.svelte');
  const { initAudioPlayer } = await import('../src/lib/core/audio-player');
  initAudioPlayer();
  store.setQueue(
    ['one', 'two'].map((trackId) => ({
      trackId,
      name: trackId,
      artistName: 'Artist',
      albumName: 'Album',
      duration: 'PT3M',
      isAvailable: true,
    })),
    0,
  );
  return { store, audio: AudioFixture.instance };
}

it('keeps the seek bar ready when a download stalls during buffered playback', async () => {
  const { store, audio } = await start();
  audio.readyState = 3;
  audio.dispatchEvent(new Event('playing'));
  store.next();
  expect(store.getPlayerState().status).toBe('loading');
  audio.readyState = 3;
  audio.dispatchEvent(new Event('playing'));
  audio.dispatchEvent(new Event('stalled'));
  expect(store.currentSong()?.trackId).toBe('two');
  expect(store.getPlayerState().status).toBe('playing');
});

it('clears stale loading on playback updates while preserving real buffering and seeking', async () => {
  const { store, audio } = await start();
  audio.readyState = 3;
  audio.dispatchEvent(new Event('playing'));
  store.next();
  audio.readyState = 2;
  audio.dispatchEvent(new Event('waiting'));
  audio.dispatchEvent(new Event('timeupdate'));
  expect(store.getPlayerState().status).toBe('loading');
  audio.readyState = 3;
  audio.seeking = true;
  audio.dispatchEvent(new Event('timeupdate'));
  expect(store.getPlayerState().status).toBe('loading');
  audio.seeking = false;
  audio.currentTime = 1;
  audio.dispatchEvent(new Event('timeupdate'));
  expect(store.getPlayerState().status).toBe('playing');
  expect(store.getPlayerState().currentTime).toBe(1);
  expect(requestAnimationFrame).toHaveBeenCalledTimes(2);
});

it('does not let late loading events replace the paused state', async () => {
  const { store, audio } = await start();
  audio.readyState = 3;
  audio.dispatchEvent(new Event('playing'));
  store.pause();
  for (const event of ['loadstart', 'waiting', 'stalled', 'timeupdate']) {
    audio.dispatchEvent(new Event(event));
    expect(store.getPlayerState().status).toBe('paused');
  }
});

it('prefetches the next queued song once playback starts', async () => {
  const fetchMock = vi.fn(async () => new Response('audio'));
  vi.stubGlobal('fetch', fetchMock);
  const { audio } = await start();
  audio.readyState = 3;
  audio.dispatchEvent(new Event('playing'));
  expect(fetchMock).toHaveBeenCalledWith(
    '/api/songs/two/audio',
    expect.objectContaining({ priority: 'low' }),
  );
});

it('reports playback start time for new songs', async () => {
  const fetchMock = vi.fn(
    async (_url: string, _init?: RequestInit) =>
      new Response(null, { status: 204 }),
  );
  vi.stubGlobal('fetch', fetchMock);
  const { store, audio } = await start();
  audio.readyState = 3;
  audio.dispatchEvent(new Event('playing'));
  const reports = () =>
    fetchMock.mock.calls
      .filter(([url]) => url === '/api/metrics/playback-start')
      .map(([, init]) => JSON.parse(String(init?.body)));
  expect(reports()).toEqual([
    expect.objectContaining({ trigger: 'manual', prefetched: false }),
  ]);
  audio.dispatchEvent(new Event('ended'));
  audio.dispatchEvent(new Event('playing'));
  expect(store.currentSong()?.trackId).toBe('two');
  expect(reports()[1]).toEqual(expect.objectContaining({ trigger: 'auto' }));
});
