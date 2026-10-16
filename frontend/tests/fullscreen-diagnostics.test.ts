import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { requestFullscreenWithDiagnostics } from '../src/lib/fullscreen-diagnostics';

let element: HTMLDivElement;
let dispose: (() => void) | undefined;
beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, 'info').mockImplementation(() => {});
  delete window.orpheusFullscreenDiagnostics;
  element = document.createElement('div');
  document.body.append(element);
});
afterEach(() => {
  dispose?.();
  dispose = undefined;
  element.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
it('distinguishes an absent API from a pending request', () => {
  dispose = requestFullscreenWithDiagnostics(element);
  expect(
    window.orpheusFullscreenDiagnostics?.map((entry) => entry.stage),
  ).toEqual(['unsupported']);
});
it('captures rejection details rather than reporting a pending request', async () => {
  Object.defineProperty(element, 'requestFullscreen', {
    value: () =>
      Promise.reject(
        new DOMException('User gesture required', 'NotAllowedError'),
      ),
  });
  dispose = requestFullscreenWithDiagnostics(element);
  await Promise.resolve();
  await vi.advanceTimersByTimeAsync(3000);
  expect(window.orpheusFullscreenDiagnostics?.at(-1)).toMatchObject({
    stage: 'rejected',
    errorName: 'NotAllowedError',
    errorMessage: 'User gesture required',
  });
});
it('records an unresolved promise after three seconds and can still observe later success', async () => {
  let resolve!: () => void;
  Object.defineProperty(element, 'requestFullscreen', {
    value: () =>
      new Promise<void>((done) => {
        resolve = done;
      }),
  });
  dispose = requestFullscreenWithDiagnostics(element);
  await vi.advanceTimersByTimeAsync(3000);
  expect(window.orpheusFullscreenDiagnostics?.at(-1)?.stage).toBe(
    'pending-after-3s',
  );
  document.dispatchEvent(new Event('fullscreenchange'));
  resolve();
  await Promise.resolve();
  expect(
    window.orpheusFullscreenDiagnostics?.map((entry) => entry.stage),
  ).toEqual(['request', 'pending-after-3s', 'fullscreenchange', 'resolved']);
});
it('removes observers and the pending deadline when video closes', async () => {
  Object.defineProperty(element, 'requestFullscreen', {
    value: () => new Promise<void>(() => {}),
  });
  dispose = requestFullscreenWithDiagnostics(element);
  dispose();
  dispose = undefined;
  const count = window.orpheusFullscreenDiagnostics?.length;
  document.dispatchEvent(new Event('fullscreenerror'));
  await vi.advanceTimersByTimeAsync(3000);
  expect(window.orpheusFullscreenDiagnostics).toHaveLength(count!);
  expect(window.orpheusFullscreenDiagnostics?.at(-1)?.stage).toBe(
    'observation-ended-while-pending',
  );
});
