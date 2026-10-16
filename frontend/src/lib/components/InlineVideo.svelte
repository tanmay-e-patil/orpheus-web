<script lang="ts">
  import { onMount } from 'svelte';
  import { loadYouTube, type YouTubePlayer } from '$lib/youtube';
  import { createVideoPlayback } from '$lib/video-playback';
  import { errorMessage } from '$lib/state';
  import { getPlayerState } from '$lib/core/player-store.js';
  let {
    id,
    active = false,
    onerror,
  }: {
    id: string;
    active?: boolean;
    onerror: (message: string) => void;
  } = $props();
  let target: HTMLDivElement;
  let loading = $state(true);
  let blocked = $state(false);
  let preparationError = '';
  let player: YouTubePlayer | undefined;
  let ready = false;
  let playback: ReturnType<typeof createVideoPlayback> | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;

  function fail(message: string) {
    clearTimeout(timeout);
    playback?.fail();
    playback = undefined;
    preparationError = message;
    if (active) onerror(message);
  }

  // Called synchronously from the Video tab click, before Svelte updates it.
  export function activate() {
    if (preparationError) {
      onerror(preparationError);
      return;
    }
    if (playback) {
      blocked = false;
      playback.retry();
      return;
    }
    playback = createVideoPlayback();
    loading = true;
    blocked = false;
    timeout = setTimeout(
      () => fail('YouTube could not load. Continuing with audio.'),
      15000,
    );
    if (ready && player) playback.attach(player);
  }

  function prepare() {
    if (!ready || !player || playback) return;
    // seekTo requests media, unlike merely cueing a thumbnail. Keep the
    // prepared player paused; buffering while paused is controlled by YouTube.
    player.seekTo(getPlayerState().currentTime, true);
    player.pauseVideo();
  }

  function deactivate() {
    clearTimeout(timeout);
    playback?.release();
    playback = undefined;
    blocked = false;
  }

  $effect(() => {
    if (active) {
      if (!playback) activate();
    } else deactivate();
  });

  onMount(() => {
    let destroyed = false;
    // Prepare the iframe as soon as this song enters the queue. Keep it cued
    // without playing hidden video or taking control away from native audio.
    loadYouTube()
      .then((YT) => {
        if (destroyed) return;
        player = new YT.Player(target, {
          videoId: id,
          width: '100%',
          height: '100%',
          playerVars: {
            autoplay: 0,
            playsinline: 1,
            rel: 0,
            controls: 1,
            origin: location.origin,
          },
          events: {
            onReady: () => {
              if (destroyed || !player) return;
              ready = true;
              if (playback) playback.attach(player);
              else prepare();
              if (playback && !playback.waitingForPlayback) {
                clearTimeout(timeout);
                loading = false;
              }
            },
            onStateChange: (event: { data: number }) => {
              if (destroyed || !playback) return;
              playback.stateChanged(event.data);
              if (!playback.waitingForPlayback) {
                clearTimeout(timeout);
                loading = false;
              }
              if (event.data === 1) blocked = false;
            },
            onError: () => {
              if (!destroyed)
                fail(
                  'This YouTube video could not play. Continuing with audio.',
                );
            },
            onAutoplayBlocked: () => {
              if (destroyed || !playback) return;
              clearTimeout(timeout);
              // Restore native audio and provide a direct gesture retry.
              playback.fail();
              playback = undefined;
              blocked = true;
              loading = false;
            },
          },
        });
      })
      .catch((e) => {
        if (!destroyed) fail(errorMessage(e));
      });
    const timer = setInterval(() => playback?.sync(), 250);
    const preparationTimer = setInterval(prepare, 5000);
    return () => {
      destroyed = true;
      deactivate();
      clearInterval(timer);
      clearInterval(preparationTimer);
      player?.destroy();
    };
  });
</script>

<div class="inline-video" aria-busy={active && loading}>
  <div class="inline-video-mount"><div bind:this={target}></div></div>
  {#if active && blocked}
    <button class="inline-video-loading" onclick={activate}>Play video</button>
  {:else if active && loading}
    <span class="inline-video-loading" role="status">Loading video…</span>
  {/if}
</div>
