import { untrack } from 'svelte';
import { next, pause, play, player, prev, seek } from './player-store.svelte';

type AudioSessionNavigator = Navigator & {
  audioSession?: { type: string };
};

// Declare music playback where supported (notably Safari). This must never
// prevent playback on browsers that omit or reject the experimental API.
export function configureAudioSession() {
  try {
    const { audioSession } = navigator as AudioSessionNavigator;
    if (audioSession) audioSession.type = 'playback';
  } catch (error) {
    console.debug('Audio session configuration unavailable', error);
  }
}

/** Mirrors the player onto the lock screen. Returns a cleanup function. */
export function initMediaSession() {
  const session = navigator.mediaSession;
  if (!session) return () => {};

  function seekTo(seconds: number | undefined) {
    if (seconds === undefined || !Number.isFinite(seconds)) return;
    seek(Math.max(0, Math.min(seconds, player.duration || Infinity)));
  }
  const handlers: Partial<
    Record<MediaSessionAction, MediaSessionActionHandler>
  > = {
    play,
    pause,
    previoustrack: prev,
    nexttrack: next,
    seekto: ({ seekTime }) => seekTo(seekTime),
    seekbackward: ({ seekOffset = 10 }) =>
      seekTo(player.currentTime - seekOffset),
    seekforward: ({ seekOffset = 10 }) =>
      seekTo(player.currentTime + seekOffset),
    stop: () => {
      pause();
      seekTo(0);
    },
  };
  for (const [action, handler] of Object.entries(handlers)) {
    try {
      session.setActionHandler(action as MediaSessionAction, handler);
    } catch {
      // Browsers support different subsets of media actions.
    }
  }

  return $effect.root(() => {
    // Rebuild metadata only when the song's details change, not when an
    // unrelated field such as its play count produces a new song object.
    const metadataKey = $derived.by(() => {
      const song = player.song;
      return JSON.stringify([
        song?.trackId,
        song?.name,
        song?.artistName,
        song?.albumName,
        song?.albumArt,
      ]);
    });
    $effect.pre(() => {
      void metadataKey;
      const song = untrack(() => player.song);
      if (typeof MediaMetadata === 'undefined') return;
      session.metadata = song
        ? new MediaMetadata({
            title: song.name,
            artist: song.artistName,
            album: song.albumName,
            artwork: song.albumArt ? [{ src: song.albumArt }] : [],
          })
        : null;
    });
    $effect.pre(() => {
      const { song, status, duration, currentTime } = player;
      session.playbackState =
        !song || ['idle', 'ended', 'unavailable'].includes(status)
          ? 'none'
          : status === 'playing' || status === 'loading'
            ? 'playing'
            : 'paused';
      if (!session.setPositionState) return;
      try {
        if (song && Number.isFinite(duration) && duration > 0) {
          session.setPositionState({
            duration,
            playbackRate: 1,
            position: Math.max(0, Math.min(currentTime || 0, duration)),
          });
        } else session.setPositionState();
      } catch {
        // Position reporting is optional and must not interrupt playback.
      }
    });
  });
}
