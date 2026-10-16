import { tick } from 'svelte';
import { writable } from 'svelte/store';
export const route = writable({
  path: location.pathname,
  search: location.search,
});
export function navigate(url: string, replace = false) {
  const next = new URL(url, location.origin);
  if (next.origin !== location.origin) {
    location.href = next.href;
    return;
  }
  const changedPage = next.pathname !== location.pathname;
  history[replace ? 'replaceState' : 'pushState'](
    {},
    '',
    next.pathname + next.search,
  );
  route.set({ path: next.pathname, search: next.search });
  if (changedPage)
    tick().then(() => {
      window.scrollTo({ top: 0, behavior: 'instant' });
      document.getElementById('main')?.focus({ preventScroll: true });
    });
}
export function syncRoute() {
  route.set({ path: location.pathname, search: location.search });
}
