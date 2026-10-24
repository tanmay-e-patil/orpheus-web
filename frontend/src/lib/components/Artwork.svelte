<script lang="ts">
  import { Disc3 } from '@lucide/svelte';
  import { artworkImage } from '$lib/artwork';
  let {
    src,
    size = 'normal',
    alt = '',
    onfailed,
    displayWidth,
  }: {
    src?: string;
    size?: 'normal' | 'large' | 'small';
    alt?: string;
    onfailed?: () => void;
    displayWidth?: number;
  } = $props();
  let failed = $state(false);
  let originalFallback = $state(false);
  const image = $derived(
    originalFallback
      ? { src, srcset: undefined, sizes: undefined }
      : artworkImage(
          src,
          displayWidth ?? (size === 'small' ? 36 : size === 'large' ? 112 : 44),
        ),
  );
  $effect(() => {
    src;
    failed = false;
    originalFallback = false;
  });
</script>

<div class="artwork {size}">
  {#if src && !failed}<img
      src={image.src}
      srcset={image.srcset}
      sizes={image.sizes}
      {alt}
      loading="lazy"
      decoding="async"
      onerror={() => {
        if (!originalFallback && image.srcset) {
          originalFallback = true;
          return;
        }
        failed = true;
        onfailed?.();
      }}
    />{:else}<Disc3 size={size === 'large' ? 76 : 22} strokeWidth={1.2} />{/if}
</div>
