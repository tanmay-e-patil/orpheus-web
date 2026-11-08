import { mediaQuery } from './media-query';

export type Appearance = 'dark' | 'light' | 'system';

const storageKey = 'orpheus-appearance';
const systemDark = mediaQuery('(prefers-color-scheme: dark)');

function stored(): Appearance {
  try {
    const value = localStorage.getItem(storageKey);
    return value === 'light' || value === 'system' ? value : 'dark';
  } catch {
    return 'dark';
  }
}

// index.html applies the stored preference before first paint; this keeps it
// in sync afterwards, including when the system theme changes.
export const appearance = $state({ preference: stored() });

export function applyAppearance() {
  const { preference } = appearance;
  const dark =
    preference === 'dark' || (preference === 'system' && systemDark.current);
  try {
    localStorage.setItem(storageKey, preference);
  } catch {
    /* The theme still applies when browser storage is disabled. */
  }
  document.documentElement.classList.toggle('dark', dark);
}
