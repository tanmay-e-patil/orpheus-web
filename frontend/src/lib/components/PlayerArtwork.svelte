<script lang="ts">
  import { tick } from 'svelte';
  import Artwork from './Artwork.svelte';

  let { src, target }: { src?: string; target?: HTMLDivElement } = $props();
  let artwork: HTMLDivElement;
  let ready = $state(false);
  let bounds = $state({ left: 0, top: 0, width: 0, height: 0 });

  $effect(() => {
    const slot = target;
    if (!slot) return;
    let disposed = false;
    let frame = 0;
    const position = () => {
      const parent = artwork?.offsetParent;
      if (disposed || !parent || !slot.isConnected) return;
      const destination = slot.getBoundingClientRect();
      const origin = parent.getBoundingClientRect();
      bounds = {
        left: destination.left - origin.left - parent.clientLeft,
        top: destination.top - origin.top - parent.clientTop,
        width: destination.width,
        height: destination.height,
      };
      frame = requestAnimationFrame(() => (ready = true));
    };
    const observer = new ResizeObserver(position);
    observer.observe(slot);
    if (artwork?.offsetParent) observer.observe(artwork.offsetParent);
    window.addEventListener('resize', position);
    void tick().then(() => {
      if (!disposed) position();
    });
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', position);
    };
  });
</script>

<div
  bind:this={artwork}
  class="now-playing-floating-artwork"
  class:ready
  aria-hidden="true"
  style:left={`${bounds.left}px`}
  style:top={`${bounds.top}px`}
  style:width={`${bounds.width}px`}
  style:height={`${bounds.height}px`}
>
  {#if bounds.width > 0}
    <Artwork
      {src}
      size={bounds.width > 100 ? 'large' : 'normal'}
      displayWidth={bounds.width}
    />
  {/if}
</div>
