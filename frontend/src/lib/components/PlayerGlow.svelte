<script lang="ts">
  import { artworkImage } from '$lib/artwork';
  let { src }: { src?: string } = $props();
  const image = $derived(artworkImage(src, 120));
  let failed = $state(false);
  $effect(() => {
    src;
    failed = false;
  });
</script>

<!-- Blurring the cover blends its colors without cross-origin canvas access. -->
<div class="now-playing-glow" aria-hidden="true">
  {#if src && !failed}
    <img
      src={image.src}
      alt=""
      decoding="async"
      onerror={() => (failed = true)}
    />
  {/if}
</div>
