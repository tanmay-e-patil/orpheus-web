<script lang="ts">
  let { src }: { src?: string } = $props();
  let failed = $state(false);
  $effect(() => {
    src;
    failed = false;
  });
</script>

<!-- Blurring the cover blends its colors without cross-origin canvas access. -->
<div class="now-playing-glow" aria-hidden="true">
  {#if src && !failed}
    <img {src} alt="" onerror={() => (failed = true)} />
  {/if}
</div>
