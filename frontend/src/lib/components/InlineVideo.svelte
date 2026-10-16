<script lang="ts">
  import { onMount } from 'svelte';
  import { loadYouTube, type YouTubePlayer } from '$lib/youtube';
  import { createVideoPlayback } from '$lib/video-playback';
  import { errorMessage } from '$lib/state';
  let { id, onerror }: { id: string; onerror: (message: string) => void } =
    $props();
  let target: HTMLDivElement;
  let loading = $state(true);
  onMount(() => {
    let destroyed = false;
    let player: YouTubePlayer | undefined;
    const playback = createVideoPlayback();
    const fail = (message: string) => {
      if (destroyed) return;
      clearTimeout(timeout);
      playback.fail();
      onerror(message);
    };
    const timeout = setTimeout(
      () => fail('YouTube could not load. Continuing with audio.'),
      15000,
    );
    loadYouTube()
      .then((YT) => {
        if (destroyed) return;
        player = new YT.Player(target, {
          videoId: id,
          width: '100%',
          height: '100%',
          playerVars: {
            playsinline: 1,
            rel: 0,
            controls: 1,
            start: Math.floor(playback.startTime),
            origin: location.origin,
          },
          events: {
            onReady: () => {
              if (destroyed || !player) return;
              clearTimeout(timeout);
              loading = false;
              playback.attach(player);
            },
            onStateChange: (event: { data: number }) =>
              playback.stateChanged(event.data),
            onError: () =>
              fail('This YouTube video could not play. Continuing with audio.'),
            onAutoplayBlocked: () => playback.stateChanged(2),
          },
        });
      })
      .catch((e) => fail(errorMessage(e)));
    const timer = setInterval(playback.sync, 250);
    return () => {
      destroyed = true;
      clearTimeout(timeout);
      clearInterval(timer);
      playback.release();
      player?.destroy();
    };
  });
</script>

<div class="inline-video" aria-busy={loading}>
  <div class="inline-video-mount"><div bind:this={target}></div></div>
  {#if loading}<span class="inline-video-loading" role="status"
      >Opening audio source…</span
    >{/if}
</div>
