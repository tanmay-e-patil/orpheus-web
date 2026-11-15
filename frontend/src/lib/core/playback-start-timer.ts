export type PlaybackTrigger = 'manual' | 'auto';

export type PlaybackStartReport = {
  seconds: number;
  trigger: PlaybackTrigger;
  prefetched: boolean;
};

// Longer waits are backgrounded tabs or abandoned loads, not start latency.
const MAX_SECONDS = 60;

/**
 * Measures "playback start time": from a play request for a newly loaded song
 * until the audio element fires `playing`. Resuming a song that already
 * played is not a start, and a pause or new load before audio begins discards
 * the measurement.
 */
export function createPlaybackStartTimer(
  report: (report: PlaybackStartReport) => void,
  now: () => number = () => performance.now(),
) {
  let awaitingFirstPlay = false;
  let autoAdvance = false;
  let pending: {
    startedAt: number;
    trigger: PlaybackTrigger;
    prefetched: boolean;
  } | null = null;

  return {
    loaded() {
      awaitingFirstPlay = true;
      pending = null;
    },
    playRequested(prefetched: boolean) {
      if (!awaitingFirstPlay || pending) return;
      pending = {
        startedAt: now(),
        trigger: autoAdvance ? 'auto' : 'manual',
        prefetched,
      };
    },
    autoAdvance(advance: () => void) {
      autoAdvance = true;
      try {
        advance();
      } finally {
        autoAdvance = false;
      }
    },
    playing() {
      if (!pending) return;
      const { startedAt, trigger, prefetched } = pending;
      pending = null;
      awaitingFirstPlay = false;
      const seconds = (now() - startedAt) / 1000;
      if (seconds > 0 && seconds <= MAX_SECONDS) {
        report({ seconds, trigger, prefetched });
      }
    },
    cancel() {
      pending = null;
    },
  };
}
