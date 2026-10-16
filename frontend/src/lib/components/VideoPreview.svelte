<script lang="ts">
  import * as Dialog from '$lib/components/ui/dialog';
  import VideoFrame from './VideoFrame.svelte';
  import type { Video } from '$lib/types';
  let {
    video,
    lyrics = '',
    onclose,
  }: { video: Video | null; lyrics?: string; onclose: () => void } = $props();
</script>

<Dialog.Root
  open={!!video}
  onOpenChange={(open) => {
    if (!open) onclose();
  }}
  ><Dialog.Content class="video-dialog"
    ><Dialog.Header
      ><Dialog.Title>{video?.title || 'Audio source preview'}</Dialog.Title
      ><Dialog.Description
        >{video?.channelTitle ||
          'Preview the selected audio source.'}</Dialog.Description
      ></Dialog.Header
    >{#if video}<VideoFrame id={video.id} {lyrics} />{/if}</Dialog.Content
  ></Dialog.Root
>
