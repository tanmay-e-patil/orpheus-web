import {
  currentSong,
  getPlayerState,
  next,
  setController,
  setDuration,
  setPlaybackStatus,
  setTime,
} from './core/player-store.js';
import type { Song } from './types';
import type { YouTubePlayer } from './youtube';

export interface PlaybackController {
  canPlay?(song: Song): boolean;
  usesAudio?(controller: PlaybackController): boolean;
  load(song: Song): void;
  play(): void;
  pause(): void;
  stop(): void;
  seekTo(seconds: number): void;
  getCurrentTime(): number;
  getDuration(): number;
  setVolume(volume: number): void;
  getVolume(): number;
  isMuted(): boolean;
}

// The iframe and native audio share one transport, timeline, and queue. Native
// audio stays loaded while paused so returning to it doesn't restart the song.
export function createVideoPlayback() {
  const initial = getPlayerState();
  const audio = initial.controller as PlaybackController | null;
  const songId = currentSong()?.trackId;
  const audioDuration = initial.duration;
  const wasPlaying =
    initial.status === 'playing' || initial.status === 'loading';
  let time = audio?.getCurrentTime() ?? initial.currentTime;
  let volume = audio?.getVolume() ?? 80;
  const available = currentSong()?.isAvailable !== false;
  let playing = wasPlaying || !available;
  let handedOff = false;
  const muted = audio?.isMuted() ?? false;
  let player: YouTubePlayer | undefined;
  let released = false;

  const controller: PlaybackController = {
    canPlay: (song) => song.trackId === songId,
    usesAudio: (candidate) => !handedOff && available && candidate === audio,
    load(song) {
      // Queue changes immediately hand control back to the native engine. The
      // caller's following play() then targets the newly restored controller.
      release(false);
      audio?.load(song);
    },
    play() {
      playing = true;
      if (!handedOff && available) audio?.play();
      player?.playVideo();
    },
    pause() {
      playing = false;
      if (!handedOff && available) audio?.pause();
      player?.pauseVideo();
    },
    stop() {
      playing = false;
      release(false);
      audio?.stop();
    },
    seekTo(value) {
      time = value;
      if (!handedOff && available) audio?.seekTo(value);
      player?.seekTo(value, true);
    },
    getCurrentTime: () =>
      !handedOff && available
        ? (audio?.getCurrentTime() ?? time)
        : (player?.getCurrentTime() ?? time),
    getDuration: () => player?.getDuration() || audioDuration,
    setVolume(value) {
      volume = value;
      if (!handedOff && available) audio?.setVolume(value);
      player?.setVolume(value);
    },
    getVolume: () => player?.getVolume() ?? volume,
    isMuted: () => player?.isMuted() ?? false,
  };
  setController(controller);
  if (!available) setPlaybackStatus('loading');

  function ownsPlayback() {
    return !released && getPlayerState().controller === controller;
  }
  function sync() {
    if (!ownsPlayback() || !player || !handedOff) return;
    time = player.getCurrentTime();
    setTime(time);
    const duration = player.getDuration();
    if (duration) setDuration(duration);
  }
  function release(resume = true, failed = false) {
    if (released) return;
    const owns = ownsPlayback();
    const sameSong = currentSong()?.trackId === songId;
    const position = handedOff ? (player?.getCurrentTime() ?? time) : time;
    if (handedOff) volume = player?.getVolume() ?? volume;
    released = true;
    player?.pauseVideo();
    if (!owns) return;
    setController(audio);
    if (!resume || !sameSong) return;
    if (currentSong()?.isAvailable === false) {
      setTime(0);
      setDuration(audioDuration);
      setPlaybackStatus('unavailable');
      return;
    }
    if (!handedOff) return;
    audio?.setVolume(volume);
    audio?.seekTo(position);
    setTime(position);
    setDuration(audioDuration);
    if (failed ? wasPlaying : playing) {
      audio?.play();
      setPlaybackStatus('playing');
    } else setPlaybackStatus('paused');
  }
  return {
    startTime: time,
    autoplay: playing,
    retry() {
      if (!ownsPlayback() || !player) return;
      playing = true;
      if (!muted) player.unMute();
      player.playVideo();
    },
    get waitingForPlayback() {
      return playing && !handedOff;
    },
    attach(instance: YouTubePlayer) {
      if (!ownsPlayback()) return;
      player = instance;
      player.setVolume(volume);
      // Set sound before playVideo, within the tab click when already ready.
      // Unmuting only after PLAYING can cause the browser to pause autoplay.
      if (muted) player.mute();
      else player.unMute();
      if (available) time = audio?.getCurrentTime() ?? time;
      player.seekTo(time, true);
      if (playing) player.playVideo();
      else player.pauseVideo();
    },
    stateChanged(value: number) {
      if (!ownsPlayback()) return;
      if (!handedOff) {
        if (value !== 1 || !player) return;
        if (available) {
          const position = audio?.getCurrentTime() ?? time;
          if (Math.abs(player.getCurrentTime() - position) > 1)
            player.seekTo(position, true);
        }
        handedOff = true;
        audio?.pause();
      }
      sync();
      if (value === 1) {
        playing = true;
        setPlaybackStatus('playing');
      } else if (value === 2) {
        playing = false;
        setPlaybackStatus('paused');
      } else if (value === 3) setPlaybackStatus('loading');
      else if (value === 0) {
        playing = false;
        next();
      }
    },
    sync,
    release,
    fail() {
      release(true, true);
    },
  };
}
