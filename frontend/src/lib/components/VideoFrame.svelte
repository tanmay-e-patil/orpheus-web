<script lang="ts">
  import { onMount } from 'svelte';
  import { loadYouTube, type YouTubePlayer } from '$lib/youtube';
  import { pause } from '$lib/core/player-store.js';
  import { parseLRC, findActiveIndex } from '$lib/core/lrc.js';
  import { clock } from '$lib/music';
  import { errorMessage } from '$lib/state';
  let { id, lyrics = '' }: { id: string; lyrics?: string } = $props();
  let target: HTMLDivElement,
    time = $state(0),
    error = $state('');
  let player: YouTubePlayer | undefined;
  const lines = $derived(parseLRC(lyrics));
  const active = $derived(findActiveIndex(lines, time * 1000));
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
{#if error}<p class="error-message">
    {error}
    <a
      href={`https://www.youtube.com/watch?v=${encodeURIComponent(id)}`}
      target="_blank"
      rel="noreferrer">Open on YouTube</a
    >
  </p>{/if}
{#if lines.length}<p class="small muted">Sync preview · {clock(time)}</p>
  <div class="sync-preview">
    {#each lines as line, index}<button
        class:active={index === active}
        onclick={() => player?.seekTo(line.timeMs / 1000, true)}
        >{line.text || '♪'}</button
      >{/each}
  </div>{/if}
