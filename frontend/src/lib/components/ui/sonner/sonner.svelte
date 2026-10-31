<script lang="ts">
  import {
    CircleCheck,
    Info,
    Loader2,
    OctagonX,
    TriangleAlert,
  } from '@lucide/svelte';
  import { Toaster as Sonner, type ToasterProps } from 'svelte-sonner';

  let { ...restProps }: ToasterProps = $props();
</script>

<Sonner
  class="toaster group"
  style="--normal-bg: var(--color-popover); --normal-text: var(--color-popover-foreground); --normal-border: var(--color-border);"
  toastOptions={{ classes: { toast: 'cn-toast', error: '!text-destructive' } }}
  {...restProps}
>
  {#snippet loadingIcon()}<Loader2 class="size-4 animate-spin" />{/snippet}
  {#snippet successIcon()}<CircleCheck class="size-4" />{/snippet}
  {#snippet errorIcon()}<OctagonX class="size-4" />{/snippet}
  {#snippet infoIcon()}<Info class="size-4" />{/snippet}
  {#snippet warningIcon()}<TriangleAlert class="size-4" />{/snippet}
</Sonner>
