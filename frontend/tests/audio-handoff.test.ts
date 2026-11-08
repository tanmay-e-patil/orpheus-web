import { it, expect, vi } from 'vitest';
import { createVideoPlayback } from '../src/lib/video-playback';
import {
  getPlayerState,
  currentSong,
  setQueue,
} from '../src/lib/core/player-store.svelte';
import type { Song } from '../src/lib/types';
it('ignores native audio events while the YouTube transport owns playback', async () => {
  class AudioFixture extends EventTarget {
    static instance: AudioFixture;
    currentTime = 42;
    duration = 180;
    paused = true;
    ended = false;
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
      this.dispatchEvent(new Event('playing'));
      return Promise.resolve();
    }
    pause() {
      this.paused = true;
      this.dispatchEvent(new Event('pause'));
    }
    load() {
      this.dispatchEvent(new Event('loadstart'));
    }
    removeAttribute() {
      this.src = '';
    }
  }
  vi.stubGlobal('Audio', AudioFixture);
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  const { initAudioPlayer } = await import('../src/lib/core/audio-player');
  initAudioPlayer();
  const songs: Song[] = ['one', 'two'].map((trackId) => ({
    trackId,
    name: trackId,
    artistName: 'Artist',
    albumName: 'Album',
    duration: 'PT3M',
    isAvailable: true,
  }));
  setQueue(songs, 0);
  const session = createVideoPlayback();
  AudioFixture.instance.currentTime = 44;
  AudioFixture.instance.dispatchEvent(new Event('timeupdate'));
  expect(getPlayerState().currentTime).toBe(44);
  expect(AudioFixture.instance.paused).toBe(false);
  AudioFixture.instance.currentTime = 42;
  session.attach({
    destroy() {},
    getCurrentTime: () => 42,
    getDuration: () => 200,
    getVolume: () => 80,
    setVolume() {},
    isMuted: () => false,
    mute() {},
    unMute() {},
    seekTo() {},
    playVideo() {},
    pauseVideo() {},
  });
  session.stateChanged(1);
  AudioFixture.instance.currentTime = 1;
  for (const event of [
    'pause',
    'timeupdate',
    'durationchange',
    'waiting',
    'ended',
    'error',
  ])
    AudioFixture.instance.dispatchEvent(new Event(event));
  expect(getPlayerState().currentTime).toBe(42);
  expect(getPlayerState().duration).toBe(200);
  expect(getPlayerState().status).toBe('playing');
  expect(currentSong()?.trackId).toBe('one');
  session.release();
  expect(AudioFixture.instance.currentTime).toBe(42);
  vi.unstubAllGlobals();
});
