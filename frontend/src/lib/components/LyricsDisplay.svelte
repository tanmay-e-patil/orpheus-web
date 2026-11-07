<script lang="ts">
  import { tick, type Snippet } from 'svelte';
  import { centerLyric } from '$lib/lyric-scroll';
  import { parseLRC, findActiveIndex } from '$lib/core/lrc.js';
  let {
    syncedLyrics = '',
    plainLyrics = '',
    currentTime = 0,
    visible = true,
    resetKey,
    emptyMessage = 'No lyrics for this song yet.',
    onseek,
    class: className = '',
    children,
  }: {
    syncedLyrics?: string;
    plainLyrics?: string;
    currentTime?: number;
    visible?: boolean;
    resetKey?: string;
    emptyMessage?: string;
    onseek: (seconds: number) => void;
    class?: string;
    children?: Snippet;
  } = $props();
  let scroller: HTMLDivElement;
  let wasVisible = false;
  let lastKey: string | undefined;
  const lines = $derived(parseLRC(syncedLyrics));
  const active = $derived(findActiveIndex(lines, currentTime * 1000));
  $effect(() => {
    const index = active;
    const currentLines = lines;
    const isVisible = visible;
    const key = resetKey;
    const first = !wasVisible || lastKey !== key;
    wasVisible = isVisible;
    lastKey = key;
    if (!isVisible) return;
    let cancelled = false;
    tick().then(() => {
      if (cancelled || !scroller) return;
      if (index < 0 || !currentLines.length) {
        scroller.scrollTo?.({ top: 0, behavior: 'instant' });
        return;
      }
      const behavior =
        first || matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 'auto'
          : 'smooth';
      centerLyric(scroller, index, behavior);
    });
    return () => {
      cancelled = true;
    };
  });
</script>

<div class={`lyrics-content ${className}`} bind:this={scroller}>
  {@render children?.()}
  {#if lines.length}<div class="synced-lines">
      {#each lines as line, index}<button
          type="button"
          data-lyric-index={index}
          class:active={active === index}
          aria-current={active === index ? 'true' : undefined}
          onclick={() => onseek(line.timeMs / 1000)}>{line.text || '♪'}</button
        >{/each}
    </div>{:else}<pre class="plain-lyrics">{plainLyrics ||
        emptyMessage}</pre>{/if}
</div>
