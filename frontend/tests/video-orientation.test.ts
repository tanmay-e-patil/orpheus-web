import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createLandscapeLock } from '../src/lib/video-orientation';

let original: PropertyDescriptor | undefined;
beforeEach(() => {
  original = Object.getOwnPropertyDescriptor(screen, 'orientation');
});
afterEach(() => {
  if (original) Object.defineProperty(screen, 'orientation', original);
  else Reflect.deleteProperty(screen, 'orientation');
});
function orientation(value: unknown) {
  Object.defineProperty(screen, 'orientation', { configurable: true, value });
}
it('requests landscape and releases only its successful lock', async () => {
  const lock = vi.fn().mockResolvedValue(undefined),
    unlock = vi.fn(),
    report = vi.fn();
  orientation({ lock, unlock });
  const session = createLandscapeLock(report);
  session.request();
  session.request();
  await Promise.resolve();
  expect(lock).toHaveBeenCalledExactlyOnceWith('landscape');
  expect(report).toHaveBeenCalledWith('landscape-locked');
  session.release();
  session.release();
  expect(unlock).toHaveBeenCalledOnce();
});
it('handles unsupported iPhone orientation locking without interrupting video', () => {
  orientation({});
  const report = vi.fn(),
    session = createLandscapeLock(report);
  expect(() => session.request()).not.toThrow();
  session.request();
  expect(report).toHaveBeenCalledExactlyOnceWith('landscape-unsupported');
  session.release();
});
it('records a denied orientation lock without trying to unlock someone else’s orientation', async () => {
  const unlock = vi.fn(),
    report = vi.fn();
  orientation({ lock: () => Promise.reject(new Error('Not allowed')), unlock });
  const session = createLandscapeLock(report);
  session.request();
  await Promise.resolve();
  expect(report).toHaveBeenCalledWith(
    'landscape-rejected',
    'Error: Not allowed',
  );
  session.release();
  expect(unlock).not.toHaveBeenCalled();
});
it('undoes a landscape lock that finishes after fullscreen was closed', async () => {
  let resolve!: () => void;
  const unlock = vi.fn();
  orientation({
    lock: () =>
      new Promise<void>((done) => {
        resolve = done;
      }),
    unlock,
  });
  const session = createLandscapeLock(vi.fn());
  session.request();
  session.release();
  resolve();
  await Promise.resolve();
  expect(unlock).toHaveBeenCalledOnce();
});
it('does not unlock a new song when an old song’s landscape request completes late', async () => {
  let resolveOld!: () => void;
  const unlock = vi.fn();
  const lock = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<void>((done) => {
          resolveOld = done;
        }),
    )
    .mockResolvedValue(undefined);
  orientation({ lock, unlock });
  const oldSong = createLandscapeLock(vi.fn());
  oldSong.request();
  oldSong.release();
  const newSong = createLandscapeLock(vi.fn());
  newSong.request();
  await Promise.resolve();
  resolveOld();
  await Promise.resolve();
  expect(unlock).not.toHaveBeenCalled();
  newSong.release();
  expect(unlock).toHaveBeenCalledOnce();
});
