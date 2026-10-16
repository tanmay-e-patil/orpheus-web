import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import {
  createVideoPlayback,
  type PlaybackController,
} from '../src/lib/video-playback';
import {
  clearPlayer,
  currentSong,
  getPlayerState,
  next,
  pause,
  play,
  seek,
  setController,
  setQueue,
  setTime,
} from '../src/lib/core/player-store.js';
import type { YouTubePlayer } from '../src/lib/youtube';
import type { Song } from '../src/lib/types';
const songs: Song[] = ['one', 'two'].map((trackId) => ({
  trackId,
  name: trackId,
  artistName: 'Artist',
  albumName: 'Album',
  duration: 'PT3M',
  isAvailable: true,
}));
let audio: PlaybackController;
beforeEach(() => {
  clearPlayer();
  audio = {
    load: vi.fn(),
    play: vi.fn(),
    pause: vi.fn(),
    stop: vi.fn(),
    seekTo: vi.fn(),
    getCurrentTime: () => 42.5,
    getDuration: () => 180,
    getVolume: () => 65,
    setVolume: vi.fn(),
    isMuted: () => false,
  };
  setController(audio);
  setQueue(songs, 0);
  setTime(42.5);
  vi.clearAllMocks();
});
afterEach(() => clearPlayer());
function video() {
  return {
    destroy: vi.fn(),
    playVideo: vi.fn(),
    pauseVideo: vi.fn(),
    seekTo: vi.fn(),
    getCurrentTime: vi.fn(() => 42.5),
    getDuration: () => 181,
    setVolume: vi.fn(),
    getVolume: () => 55,
    isMuted: () => false,
    mute: vi.fn(),
    unMute: vi.fn(),
  } satisfies YouTubePlayer;
}
it('starts the video at the current audio position and routes controls to it', () => {
  const session = createVideoPlayback(),
    player = video();
  expect(session.startTime).toBe(42.5);
  expect(audio.pause).not.toHaveBeenCalled();
  session.attach(player);
  expect(player.seekTo).toHaveBeenCalledWith(42.5, true);
  expect(player.playVideo).toHaveBeenCalledOnce();
  expect(player.setVolume).toHaveBeenCalledWith(65);
  session.stateChanged(1);
  expect(audio.pause).toHaveBeenCalledOnce();
  expect(player.unMute).toHaveBeenCalledOnce();
  player.getCurrentTime.mockReturnValue(78.25);
  pause();
  expect(player.pauseVideo).toHaveBeenCalled();
  play();
  expect(player.playVideo).toHaveBeenCalledTimes(2);
  seek(90);
  expect(player.seekTo).toHaveBeenCalledWith(90, true);
  session.sync();
  expect(getPlayerState().currentTime).toBe(78.25);
  expect(getPlayerState().duration).toBe(181);
  session.release();
});
it('returns to audio at the video position without restarting it', () => {
  const session = createVideoPlayback(),
    player = video();
  session.attach(player);
  session.stateChanged(1);
  player.getCurrentTime.mockReturnValue(78.25);
  session.release();
  expect(getPlayerState().controller).toBe(audio);
  expect(audio.seekTo).toHaveBeenCalledWith(78.25);
  expect(audio.play).toHaveBeenCalledOnce();
  expect(audio.load).not.toHaveBeenCalled();
  expect(audio.setVolume).toHaveBeenCalledWith(55);
  expect(getPlayerState().currentTime).toBe(78.25);
  session.release();
  expect(audio.play).toHaveBeenCalledOnce();
});
it('preserves a paused video when returning to audio', () => {
  const session = createVideoPlayback(),
    player = video();
  session.attach(player);
  session.stateChanged(1);
  session.stateChanged(2);
  session.release();
  expect(audio.play).not.toHaveBeenCalled();
  expect(getPlayerState().status).toBe('paused');
});
it('a queue change loads the new audio song without restoring the previous position', () => {
  const session = createVideoPlayback(),
    player = video();
  session.attach(player);
  next();
  session.release();
  expect(currentSong()?.trackId).toBe('two');
  expect(getPlayerState().controller).toBe(audio);
  expect(audio.load).toHaveBeenCalledWith(songs[1]);
  expect(audio.seekTo).not.toHaveBeenCalled();
  expect(audio.play).toHaveBeenCalledOnce();
});
it('clearing playback does not restart audio during video cleanup', () => {
  const session = createVideoPlayback(),
    player = video();
  session.attach(player);
  clearPlayer();
  session.release();
  expect(audio.stop).toHaveBeenCalledOnce();
  expect(audio.play).not.toHaveBeenCalled();
  expect(currentSong()).toBeNull();
});
it('a failed video restores the previous paused audio state', () => {
  pause();
  const session = createVideoPlayback();
  session.fail();
  expect(audio.play).not.toHaveBeenCalled();
  expect(audio.seekTo).not.toHaveBeenCalled();
  expect(getPlayerState().status).toBe('paused');
});
it('can control a video whose library audio is unavailable, without resuming stale native audio', () => {
  setQueue([{ ...songs[0], isAvailable: false }], 0);
  vi.clearAllMocks();
  const session = createVideoPlayback(),
    player = video();
  session.attach(player);
  play();
  expect(player.playVideo).toHaveBeenCalledTimes(2);
  session.release();
  expect(audio.play).not.toHaveBeenCalled();
  expect(getPlayerState().status).toBe('unavailable');
});

it('keeps audio running through buffering and resynchronizes before handoff', () => {
  const session = createVideoPlayback(),
    player = video();
  audio.getCurrentTime = () => 50;
  session.attach(player);
  expect(player.seekTo).toHaveBeenCalledWith(50, true);
  session.stateChanged(3);
  session.stateChanged(2);
  session.stateChanged(1);
  expect(audio.pause).not.toHaveBeenCalled();
  expect(player.unMute).not.toHaveBeenCalled();
  player.getCurrentTime.mockReturnValue(50);
  session.stateChanged(1);
  expect(audio.pause).toHaveBeenCalledOnce();
  expect(player.unMute).toHaveBeenCalledOnce();
  session.release();
});
it('closing or failing a pending switch leaves native audio untouched', () => {
  const session = createVideoPlayback();
  session.attach(video());
  session.fail();
  expect(getPlayerState().controller).toBe(audio);
  expect(audio.pause).not.toHaveBeenCalled();
  expect(audio.play).not.toHaveBeenCalled();
  expect(audio.seekTo).not.toHaveBeenCalled();
});
it('keeps paused audio paused when opening video', () => {
  pause();
  const session = createVideoPlayback(),
    player = video();
  session.attach(player);
  expect(player.playVideo).not.toHaveBeenCalled();
  session.release();
  expect(getPlayerState().status).toBe('paused');
});
