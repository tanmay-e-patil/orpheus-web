import {
  currentSong,
  getPlayerState,
  next,
  pause,
  play,
  playerStore,
  prev,
  seek,
} from './player-store.js';

// Declare music playback where supported (notably Safari). This must never
// prevent playback on browsers that omit or reject the experimental API.
export function configureAudioSession() {
  try {
    if (navigator.audioSession) navigator.audioSession.type = 'playback';
  } catch (error) {
    console.debug('Audio session configuration unavailable', error);
  }
}

export function initMediaSession() {
  const session = navigator.mediaSession;
  if (!session) return;

  function seekTo(seconds) {
    if (!Number.isFinite(seconds)) return;
    const { duration } = getPlayerState();
    seek(Math.max(0, Math.min(seconds, duration || Infinity)));
  }
  const handlers = {
    play,
    pause,
    previoustrack: prev,
    nexttrack: next,
    seekto: ({ seekTime }) => seekTo(seekTime),
    seekbackward: ({ seekOffset = 10 }) =>
      seekTo(getPlayerState().currentTime - seekOffset),
    seekforward: ({ seekOffset = 10 }) =>
      seekTo(getPlayerState().currentTime + seekOffset),
    stop: () => {
      pause();
      seekTo(0);
    },
  };
  for (const [action, handler] of Object.entries(handlers)) {
    try {
      session.setActionHandler(action, handler);
    } catch {
      // Browsers support different subsets of media actions.
    }
  }

  let metadataKey;
  function sync() {
    const song = currentSong();
    const { status, duration, currentTime } = getPlayerState();
    const key = JSON.stringify([
      song?.trackId,
      song?.name,
      song?.artistName,
      song?.albumName,
      song?.albumArt,
    ]);
    if (key !== metadataKey && typeof MediaMetadata !== 'undefined') {
      metadataKey = key;
      session.metadata = song
        ? new MediaMetadata({
            title: song.name,
            artist: song.artistName,
            album: song.albumName,
            artwork: song.albumArt ? [{ src: song.albumArt }] : [],
          })
        : null;
    }
    session.playbackState =
      !song || ['idle', 'ended', 'unavailable'].includes(status)
        ? 'none'
        : status === 'playing' || status === 'loading'
          ? 'playing'
          : 'paused';
    if (session.setPositionState) {
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
    }
  }
  playerStore.addEventListener('change', sync);
  sync();
}
