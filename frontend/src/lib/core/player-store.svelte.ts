import { untrack } from 'svelte';
import { seconds as parseISODurationSeconds } from '../music';
import type { PlaybackController, PlaybackStatus, Song } from '../types';

class PlayerState {
  // Songs are replaced, never mutated, so keep them as raw (unproxied) values.
  queue = $state.raw<Song[]>([]);
  currentIndex = $state(0);
  status = $state<PlaybackStatus>('idle');
  currentTime = $state(0);
  duration = $state(0);
  controller = $state.raw<PlaybackController | null>(null);
  song = $derived<Song | null>(this.queue[this.currentIndex] ?? null);
}

export const player = new PlayerState();

let needsLoad = false;

// Commands read state to decide what to write. Untrack them so calling one
// from an effect doesn't make that effect depend on (and rerun with) the player.
function command<Args extends unknown[]>(fn: (...args: Args) => void) {
  return (...args: Args) => untrack(() => fn(...args));
}

export function getPlayerState() {
  return player;
}

export const setController = command(
  (controller: Partial<PlaybackController> | null) => {
    player.controller = controller as PlaybackController | null;
  },
);

export const clearPlayer = command(() => {
  needsLoad = false;
  player.controller?.stop?.();
  player.queue = [];
  player.currentIndex = 0;
  player.status = 'idle';
  player.currentTime = 0;
  player.duration = 0;
});

export const setQueue = command((queue: Song[], currentIndex: number) => {
  player.queue = queue;
  player.currentIndex = currentIndex;
  player.currentTime = 0;
  loadCurrentSong({ autoplay: true });
});

export const removeQueueSong = command((trackId: string) => {
  const previous = currentSong();
  if (!player.queue.some((song) => song.trackId === trackId)) return;
  const before = player.queue
    .slice(0, player.currentIndex)
    .filter((song) => song.trackId !== trackId).length;
  player.queue = player.queue.filter((song) => song.trackId !== trackId);
  if (!player.queue.length) {
    clearPlayer();
    return;
  }
  player.currentIndex = Math.min(before, player.queue.length - 1);
  if (previous?.trackId === trackId) {
    player.controller?.stop?.();
    player.currentTime = 0;
    player.duration = parseISODurationSeconds(currentSong()?.duration);
    // Defer loading until the user chooses Play: controller.load may autoplay.
    player.status = 'idle';
    needsLoad = true;
  }
});

export const updateQueueSong = command(
  (trackId: string, patch: Partial<Song>) => {
    const wasCurrent = currentSong();
    player.queue = player.queue.map((song) => {
      if (song.trackId !== trackId) return song;
      const next = { ...song, ...patch };
      if (next.isAvailable === false) delete next.audioUrl;
      return next;
    });
    const current = currentSong();
    if (current?.trackId === trackId && current.isAvailable === false) {
      player.controller?.stop?.();
      player.status = 'unavailable';
    } else if (
      current?.trackId === trackId &&
      sourceChanged(wasCurrent, current) &&
      playableSong(current)
    ) {
      player.currentTime = 0;
      player.status = 'loading';
      player.controller?.load?.(current);
    }
  },
);

function sourceChanged(before: Song | null, after: Song | null) {
  if (!before || !after) return false;
  return (
    before.audioUrl !== after.audioUrl ||
    before.youtubeVideoId !== after.youtubeVideoId
  );
}

export const updateSongAlbumArt = command(
  (trackId: string, albumArt: string) => {
    updateQueueSong(trackId, { albumArt });
  },
);

export const updateSongPlayCount = command(
  (trackId: string, playCount: number) => {
    player.queue = player.queue.map((song) =>
      song.trackId === trackId ? { ...song, playCount } : song,
    );
  },
);

export const updateSongLyrics = command(
  (trackId: string, plainLyrics: string, syncedLyrics: string) => {
    player.queue = player.queue.map((song) =>
      song.trackId === trackId
        ? {
            ...song,
            lyrics: plainLyrics,
            syncedLyrics,
            isLyricsAvailable: Boolean(plainLyrics || syncedLyrics),
          }
        : song,
    );
  },
);

export const play = command(() => {
  if (needsLoad) {
    loadCurrentSong({ autoplay: true });
    return;
  }
  if (!playableSong(currentSong())) {
    player.status = 'unavailable';
    return;
  }
  player.controller?.play();
  player.status = 'playing';
});

export const pause = command(() => {
  player.controller?.pause();
  player.status = 'paused';
});

export const setPlaybackStatus = command((status: PlaybackStatus) => {
  player.status = status;
});

export const next = command(() => {
  const nextIndex = player.currentIndex + 1;
  if (nextIndex >= player.queue.length) {
    player.status = 'ended';
    return;
  }
  player.currentIndex = nextIndex;
  player.currentTime = 0;
  loadCurrentSong({ autoplay: true });
});

export const prev = command(() => {
  player.currentIndex = Math.max(0, player.currentIndex - 1);
  player.currentTime = 0;
  loadCurrentSong({ autoplay: true });
});

export const seek = command((seconds: number) => {
  player.controller?.seekTo(seconds);
  player.currentTime = seconds;
});

export const setTime = command((seconds: number) => {
  player.currentTime = seconds;
});

export const setDuration = command((seconds: number) => {
  player.duration = seconds;
});

export function currentSong(): Song | null {
  return player.queue[player.currentIndex] || null;
}

function loadCurrentSong({ autoplay = false } = {}) {
  needsLoad = false;
  const song = currentSong();
  if (!song || !playableSong(song)) {
    player.controller?.pause?.();
    player.status = 'unavailable';
    player.duration = parseISODurationSeconds(song?.duration);
    console.info('Song is not playable', {
      trackId: song?.trackId,
      isAvailable: song?.isAvailable,
      audioUrl: song?.audioUrl,
    });
    return;
  }
  player.status = 'loading';
  player.duration = parseISODurationSeconds(song.duration);
  player.controller?.load?.(song);
  if (autoplay) {
    player.controller?.play?.();
  }
}

function playableSong(song: Song | null) {
  return Boolean(
    song?.trackId &&
    (song.isAvailable !== false || player.controller?.canPlay?.(song)),
  );
}
