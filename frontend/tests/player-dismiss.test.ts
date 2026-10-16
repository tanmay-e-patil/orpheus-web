import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { playerDismiss } from '../src/lib/player-dismiss';

let sheet: HTMLElement;
let region: HTMLElement;
let dismiss: ReturnType<typeof vi.fn<() => void>>;
let cleanup: () => void;
let mobile = true;
let reducedMotion = false;

function pointer(
  target: HTMLElement,
  type: string,
  x: number,
  y: number,
  time: number,
  extra = {},
) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    clientX: { value: x },
    clientY: { value: y },
    timeStamp: { value: time },
    pointerId: { value: 1 },
    pointerType: { value: 'touch' },
    isPrimary: { value: true },
    ...Object.fromEntries(
      Object.entries(extra).map(([key, value]) => [key, { value }]),
    ),
  });
  target.dispatchEvent(event);
  return event;
}
function drag(target = region, distance = 200, duration = 600) {
  pointer(target, 'pointerdown', 100, 100, 0);
  pointer(target, 'pointermove', 100, 100 + distance, duration);
  pointer(target, 'pointerup', 100, 100 + distance, duration + 10);
}
beforeEach(() => {
  vi.useFakeTimers();
  mobile = true;
  reducedMotion = false;
  vi.mocked(window.matchMedia).mockImplementation((query) => ({
    get matches() {
      return query.includes('prefers-reduced-motion') ? reducedMotion : mobile;
    },
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
  sheet = document.createElement('div');
  sheet.innerHTML =
    '<header data-player-drag-region><button>Close</button></header><div data-player-drag-region class="artwork"></div><input type="range"><section class="lyrics"></section><section class="queue"></section><iframe></iframe>';
  document.body.append(sheet);
  Object.defineProperty(sheet, 'clientHeight', { value: 800 });
  sheet.setPointerCapture = vi.fn();
  sheet.hasPointerCapture = vi.fn(() => true);
  sheet.releasePointerCapture = vi.fn();
  region = sheet.querySelector('.artwork')!;
  dismiss = vi.fn();
  cleanup = playerDismiss(sheet, dismiss);
});
afterEach(() => {
  cleanup();
  sheet.remove();
  vi.useRealTimers();
});
it('follows a downward drag and dismisses after sliding offscreen', () => {
  pointer(region, 'pointerdown', 100, 100, 0);
  pointer(region, 'pointermove', 100, 300, 600);
  expect(sheet.style.getPropertyValue('--player-drag-y')).toBe('200px');
  expect(sheet.dataset.playerDismiss).toBe('dragging');
  pointer(sheet, 'pointerup', 100, 300, 610);
  expect(sheet.dataset.playerDismiss).toBe('closing');
  expect(dismiss).not.toHaveBeenCalled();
  vi.runAllTimers();
  expect(dismiss).toHaveBeenCalledOnce();
});
it('snaps back from a short slow pull and remains usable for another drag', () => {
  drag(region, 60, 600);
  expect(sheet.dataset.playerDismiss).toBe('settling');
  expect(sheet.style.getPropertyValue('--player-drag-y')).toBe('0px');
  vi.runAllTimers();
  expect(dismiss).not.toHaveBeenCalled();
  expect(sheet.dataset.playerDismiss).toBeUndefined();
  drag();
  vi.runAllTimers();
  expect(dismiss).toHaveBeenCalledOnce();
});
it('dismisses a short deliberate downward flick', () => {
  drag(region, 70, 70);
  vi.runAllTimers();
  expect(dismiss).toHaveBeenCalledOnce();
});
it('does not treat a flick followed by a hold as a fast release', () => {
  pointer(region, 'pointerdown', 100, 100, 0);
  pointer(region, 'pointermove', 100, 170, 50);
  pointer(sheet, 'pointerup', 100, 170, 500);
  vi.runAllTimers();
  expect(dismiss).not.toHaveBeenCalled();
});
it.each(['button', 'input', '.lyrics', '.queue', 'iframe'])(
  'leaves gestures on %s alone',
  (selector) => {
    drag(sheet.querySelector(selector)!);
    vi.runAllTimers();
    expect(sheet.dataset.playerDismiss).toBeUndefined();
    expect(dismiss).not.toHaveBeenCalled();
  },
);
it.each([
  [220, 110],
  [100, 20],
])('ignores horizontal and upward gestures (%i, %i)', (x, y) => {
  pointer(region, 'pointerdown', 100, 100, 0);
  pointer(region, 'pointermove', x, y, 100);
  pointer(region, 'pointerup', x, y, 110);
  vi.runAllTimers();
  expect(dismiss).not.toHaveBeenCalled();
  expect(sheet.dataset.playerDismiss).toBeUndefined();
});
it.each(['pointercancel', 'lostpointercapture'])(
  'snaps back when the browser sends %s',
  (type) => {
    pointer(region, 'pointerdown', 100, 100, 0);
    pointer(region, 'pointermove', 100, 300, 400);
    pointer(sheet, type, 100, 300, 410);
    vi.runAllTimers();
    expect(dismiss).not.toHaveBeenCalled();
    expect(sheet.style.getPropertyValue('--player-drag-y')).toBe('0px');
  },
);
it('cancels when a second finger touches the sheet', () => {
  pointer(region, 'pointerdown', 100, 100, 0);
  pointer(region, 'pointermove', 100, 300, 400);
  pointer(region, 'pointerdown', 140, 300, 410, {
    pointerId: 2,
    isPrimary: false,
  });
  pointer(sheet, 'pointerup', 100, 300, 420);
  vi.runAllTimers();
  expect(dismiss).not.toHaveBeenCalled();
});
it('does not turn a completed drag into a click', () => {
  drag(region, 60, 600);
  expect(
    region.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true }),
    ),
  ).toBe(false);
  vi.runAllTimers();
  expect(
    region.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true }),
    ),
  ).toBe(true);
});
it('supports dragging the blank header area', () => {
  drag(sheet.querySelector('header')!);
  vi.runAllTimers();
  expect(dismiss).toHaveBeenCalledOnce();
});
it('does not enable dragging on desktop with a mouse', () => {
  mobile = false;
  drag();
  vi.runAllTimers();
  expect(dismiss).not.toHaveBeenCalled();
  mobile = true;
  pointer(region, 'pointerdown', 100, 100, 0, { pointerType: 'mouse' });
  pointer(region, 'pointermove', 100, 300, 400);
  pointer(region, 'pointerup', 100, 300, 410);
  vi.runAllTimers();
  expect(dismiss).not.toHaveBeenCalled();
});
it('honors reduced motion without waiting for an animation', () => {
  reducedMotion = true;
  drag();
  vi.advanceTimersByTime(0);
  expect(dismiss).toHaveBeenCalledOnce();
});
it('cleans up pending dismissal when the player is removed', () => {
  drag();
  cleanup();
  vi.runAllTimers();
  expect(dismiss).not.toHaveBeenCalled();
  expect(sheet.style.getPropertyValue('--player-drag-y')).toBe('');
});

it('keeps dragging when implicit touch capture transfers from artwork to the sheet', () => {
  pointer(region, 'pointerdown', 100, 100, 0);
  pointer(region, 'pointermove', 100, 160, 100);
  pointer(region, 'lostpointercapture', 100, 160, 101);
  expect(sheet.dataset.playerDismiss).toBe('dragging');
  pointer(sheet, 'pointermove', 100, 300, 400);
  pointer(sheet, 'pointerup', 100, 300, 410);
  vi.runAllTimers();
  expect(dismiss).toHaveBeenCalledOnce();
});
