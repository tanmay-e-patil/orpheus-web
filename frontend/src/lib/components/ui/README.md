These components were installed with the official shadcn-svelte CLI (1.7.0, Nova style).

Upstream: https://www.shadcn-svelte.com/
License: MIT; see LICENSE.md.

Local changes:

- State/orientation selectors use Bits UI 2's `data-state` and `data-orientation` attributes.
- False `data-inset` flags are omitted so optional indentation remains optional.
- Sonner uses the application’s CSS theme tokens instead of adding `mode-watcher`; notification offsets keep it above the player and mobile navigation.
- The application's design tokens and responsive touch-target sizing live in `src/app.css`.

Review these adaptations before overwriting components with a future CLI update.
