import { expect, it, vi } from 'vitest';
import { createPlaybackStartTimer } from '../src/lib/core/playback-start-timer';

function setup() {
  let time = 1000;
  const report = vi.fn();
  const timer = createPlaybackStartTimer(report, () => time);
  return { timer, report, advance: (ms: number) => (time += ms) };
}

it('measures from the play request of a new song until playing', () => {
  const { timer, report, advance } = setup();
  timer.loaded();
  timer.playRequested(false);
  advance(420);
  timer.playing();
  expect(report).toHaveBeenCalledExactlyOnceWith({
    seconds: 0.42,
    trigger: 'manual',
    prefetched: false,
  });
});

it('labels auto-advance and prefetched starts', () => {
  const { timer, report, advance } = setup();
  timer.autoAdvance(() => {
    timer.loaded();
    timer.playRequested(true);
  });
  advance(80);
  timer.playing();
  expect(report).toHaveBeenCalledWith({
    seconds: 0.08,
    trigger: 'auto',
    prefetched: true,
  });
  timer.loaded();
  timer.playRequested(false);
  advance(10);
  timer.playing();
  expect(report).toHaveBeenLastCalledWith(
    expect.objectContaining({ trigger: 'manual' }),
  );
});

it('does not count resumes, rebuffering, or abandoned loads', () => {
  const { timer, report, advance } = setup();
  timer.loaded();
  timer.playRequested(false);
  advance(100);
  timer.playing();
  // Resume and rebuffer of a song that already played.
  timer.playRequested(false);
  advance(5000);
  timer.playing();
  // Paused before audio began.
  timer.loaded();
  timer.playRequested(false);
  timer.cancel();
  advance(100);
  timer.playing();
  // Skipped to another song before audio began: timing restarts at its play.
  timer.loaded();
  timer.playRequested(false);
  advance(3000);
  timer.loaded();
  timer.playRequested(false);
  advance(200);
  timer.playing();
  expect(report.mock.calls.map(([r]) => r.seconds)).toEqual([0.1, 0.2]);
});

it('drops implausible durations from backgrounded tabs', () => {
  const { timer, report, advance } = setup();
  timer.loaded();
  timer.playRequested(false);
  advance(61_000);
  timer.playing();
  expect(report).not.toHaveBeenCalled();
});
