<script lang="ts">
  import { Disc3 } from '@lucide/svelte';
  let {
    src,
    size = 'normal',
    alt = '',
    onfailed,
  }: {
    src?: string;
    size?: 'normal' | 'large' | 'small';
    alt?: string;
    onfailed?: () => void;
  } = $props();
  let failed = $state(false);
  $effect(() => {
    src;
    failed = false;
  });
</script>

<div class="artwork {size}">
  {#if src && !failed}<img
      {src}
      {alt}
      loading="lazy"
      onerror={() => {
        failed = true;
        onfailed?.();
      }}
    />{:else}<Disc3 size={size === 'large' ? 76 : 22} strokeWidth={1.2} />{/if}
</div>
