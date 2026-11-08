import { tick } from 'svelte';
export const route = $state({
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
  route.path = next.pathname;
  route.search = next.search;
  if (changedPage)
    tick().then(() => {
      window.scrollTo({ top: 0, behavior: 'instant' });
      document.getElementById('main')?.focus({ preventScroll: true });
    });
}
export function syncRoute() {
  route.path = location.pathname;
  route.search = location.search;
}
