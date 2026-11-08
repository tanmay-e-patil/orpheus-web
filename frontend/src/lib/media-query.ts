import { createSubscriber } from 'svelte/reactivity';

/**
 * Like `MediaQuery` from svelte/reactivity, but `matchMedia` runs only while
 * the value is observed instead of when the module is imported.
 */
export function mediaQuery(query: string) {
  let media: MediaQueryList | undefined;
  const subscribe = createSubscriber((update) => {
    const list = window.matchMedia(query);
    media = list;
    list.addEventListener('change', update);
    return () => {
      list.removeEventListener('change', update);
      media = undefined;
    };
  });
  return {
    get current() {
      subscribe();
      return (media ?? window.matchMedia(query)).matches;
    },
  };
}
