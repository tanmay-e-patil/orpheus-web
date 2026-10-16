import '@testing-library/jest-dom/vitest';
import { vi, beforeEach } from 'vitest';
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});
class Observer {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', Observer);
vi.stubGlobal('IntersectionObserver', Observer);
Element.prototype.scrollIntoView = vi.fn();
window.scrollTo = vi.fn();
beforeEach(() => {
  localStorage.clear();
  history.replaceState({}, '', '/home');
});
