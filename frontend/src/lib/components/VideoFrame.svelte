<script lang="ts">
  import { onMount } from 'svelte';
  import LyricsDisplay from './LyricsDisplay.svelte';
  import * as Alert from '$lib/components/ui/alert';
  import {
    loadYouTube,
    youtubeErrorMessage,
    type YouTubePlayer,
  } from '$lib/youtube';
  import { pause } from '$lib/core/player-store.svelte';
  import { clock } from '$lib/music';
  import { errorMessage } from '$lib/state.svelte';
  let {
    id,
    lyrics = '',
    plainLyrics = '',
  }: { id: string; lyrics?: string; plainLyrics?: string } = $props();
  let target: HTMLDivElement,
    time = $state(0),
    error = $state('');
  let player: YouTubePlayer | undefined;
  function seekTo(seconds: number) {
    if (!player?.seekTo) return;
    player.seekTo(seconds, true);
    time = seconds;
    player.playVideo?.();
  }
  onMount(() => {
    let destroyed = false;
    pause();
    loadYouTube()
      .then((YT) => {
        if (destroyed) return;
        player = new YT.Player(target, {
          videoId: id,
          width: '100%',
          height: '100%',
          playerVars: { playsinline: 1, rel: 0, controls: 1 },
          events: {
            onError: (event: { data: number }) => {
              error = youtubeErrorMessage(event.data);
            },
          },
        });
      })
      .catch((e) => {
        error = errorMessage(e);
      });
    const timer = setInterval(
      () => (time = player?.getCurrentTime?.() || 0),
      250,
    );
    return () => {
      destroyed = true;
      clearInterval(timer);
      player?.destroy();
    };
  });
</script>

<div class="video-frame"><div bind:this={target}></div></div>
{#if error}<Alert.Root variant="destructive" class="mt-3"
    ><Alert.Description
      >{error}
      <a
        href={`https://www.youtube.com/watch?v=${encodeURIComponent(id)}`}
        target="_blank"
        rel="noreferrer">Open on YouTube</a
      >
    </Alert.Description></Alert.Root
  >{/if}
{#if lyrics || plainLyrics}<p class="small muted">Playback · {clock(time)}</p>
  <LyricsDisplay
    syncedLyrics={lyrics}
    {plainLyrics}
    currentTime={time}
    resetKey={id}
    onseek={seekTo}
    class="preview-lyrics"
  />
{/if}
