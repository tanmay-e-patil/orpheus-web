import { it, expect, vi } from 'vitest';
import { centerLyric } from '../src/lib/lyric-scroll';
it('centers the highlighted line inside its own scroller', () => {
  const container = document.createElement('div'),
    line = document.createElement('button');
  line.dataset.lyricIndex = '8';
  container.append(line);
  Object.defineProperty(container, 'clientHeight', { value: 400 });
  container.scrollTop = 100;
  container.getBoundingClientRect = () => ({ top: 120 }) as DOMRect;
  line.getBoundingClientRect = () => ({ top: 650, height: 40 }) as DOMRect;
  container.scrollTo = vi.fn();
  centerLyric(container, 8, 'smooth');
  expect(container.scrollTo).toHaveBeenCalledWith({
    top: 450,
    behavior: 'smooth',
  });
});
it('does not scroll hidden tabs or missing lyric lines', () => {
  const container = document.createElement('div');
  container.scrollTo = vi.fn();
  centerLyric(container, 3, 'auto');
  expect(container.scrollTo).not.toHaveBeenCalled();
});
