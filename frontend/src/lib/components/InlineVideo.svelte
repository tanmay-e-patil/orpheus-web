<script lang="ts">
  import { onMount } from 'svelte';
  import { Maximize2, Minimize2 } from '@lucide/svelte';
  import {
    loadYouTube,
    youtubeErrorMessage,
    type YouTubePlayer,
  } from '$lib/youtube';
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
  const iPad =
    /iPad/.test(navigator.userAgent) ||
    (/Mac/.test(navigator.platform) && navigator.maxTouchPoints > 1);
  const appleMobile = iPad || /iPhone|iPod/.test(navigator.userAgent);
  let container: HTMLDivElement;
  let target: HTMLDivElement;
  let expanded = $state(false);

  let loading = $state(true);
  let blocked = $state(false);
  let preparationError = $state('');
  let retryPlayer: (() => void) | undefined;
  let errorReported = false;
  let player: YouTubePlayer | undefined;
  let ready = false;
  let playback: ReturnType<typeof createVideoPlayback> | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;

  function fail(message: string) {
    if (preparationError) return;
    clearTimeout(timeout);
    playback?.fail();
    playback = undefined;
    preparationError = message;
    loading = false;
    if (active && !errorReported) {
      errorReported = true;
      onerror(message);
    }
  }

  function collapse() {
    expanded = false;
  }

  // The top layer lets fixed positioning fill the viewport even inside the
  // player's transformed sheet. It keeps the iframe mounted in the same DOM.
  $effect(() => {
    if (!active || !expanded) return;
    container.showPopover();
    const previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    container.querySelector<HTMLButtonElement>('.inline-video-expand')?.focus();
    return () => {
      container.hidePopover();
      document.documentElement.style.overflow = previousOverflow;
    };
  });

  // Called synchronously from the Video tab click, before Svelte updates it.
  export function activate(expand = false) {
    if (preparationError) {
      preparationError = '';
      errorReported = false;
      ready = false;
      player?.destroy();
      player = undefined;
      target.replaceChildren();
      retryPlayer?.();
    }
    if (expand) expanded = true;
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
    // On Apple mobile devices, media seeks wait for explicit activation.
    if (appleMobile || !ready || !player || playback) return;
    // seekTo requests media, unlike merely cueing a thumbnail. Keep the
    // prepared player paused; buffering while paused is controlled by YouTube.
    player.seekTo(getPlayerState().currentTime, true);
    player.pauseVideo();
  }

  function deactivate() {
    collapse();
    clearTimeout(timeout);
    playback?.release();
    playback = undefined;
    blocked = false;
  }

  $effect(() => {
    if (active) {
      if (!playback && !preparationError && !blocked) activate();
    } else deactivate();
  });

  onMount(() => {
    let destroyed = false;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !expanded) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      collapse();
    };
    document.addEventListener('keydown', escape, true);
    // Prepare the iframe as soon as this song enters the queue. Keep it cued
    // without playing hidden video or taking control away from native audio.
    let generation = 0;
    const mountPlayer = () => {
      const attempt = ++generation;
      const mount = document.createElement('div');
      target.replaceChildren(mount);
      loadYouTube()
        .then((YT) => {
          if (destroyed || attempt !== generation) return;
          player = new YT.Player(mount, {
            videoId: id,
            width: '100%',
            height: '100%',
            playerVars: {
              autoplay: 0,
              playsinline: 1,
              rel: 0,
              controls: 1,
              // Our expand control fills the app window without browser fullscreen.
              fs: 0,
              origin: location.origin,
            },
            events: {
              onReady: () => {
                if (destroyed || attempt !== generation || !player) return;
                ready = true;
                if (playback) playback.attach(player);
                else prepare();
                if (playback && !playback.waitingForPlayback) {
                  clearTimeout(timeout);
                  loading = false;
                }
              },
              onStateChange: (event: { data: number }) => {
                if (destroyed || attempt !== generation || !playback) return;
                playback.stateChanged(event.data);
                if (!playback.waitingForPlayback) {
                  clearTimeout(timeout);
                  loading = false;
                }
                if (event.data === 1) blocked = false;
              },
              onError: (event: { data: number }) => {
                if (!destroyed && attempt === generation)
                  fail(youtubeErrorMessage(event.data));
              },
              onAutoplayBlocked: () => {
                if (destroyed || attempt !== generation || !playback) return;
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
          if (!destroyed && attempt === generation) fail(errorMessage(e));
        });
    };
    retryPlayer = mountPlayer;
    mountPlayer();
    const timer = setInterval(() => playback?.sync(), 250);
    const preparationTimer = appleMobile
      ? undefined
      : setInterval(prepare, 5000);
    return () => {
      destroyed = true;
      retryPlayer = undefined;
      deactivate();
      document.removeEventListener('keydown', escape, true);
      clearInterval(timer);
      clearInterval(preparationTimer);
      player?.destroy();
    };
  });
</script>

<div
  bind:this={container}
  class="inline-video"
  class:inline-video-expanded={active && expanded}
  popover="manual"
  style:display="flex"
  aria-busy={active && loading}
>
  <div class="inline-video-mount"><div bind:this={target}></div></div>
  {#if active}
    <button
      class="inline-video-expand"
      aria-label={expanded ? 'Restore video' : 'Expand video'}
      title={expanded ? 'Restore video' : 'Expand video'}
      onclick={() => (expanded = !expanded)}
    >
      {#if expanded}<Minimize2 size={20} />{:else}<Maximize2 size={20} />{/if}
    </button>
  {/if}
  {#if active && preparationError}
    <div class="inline-video-error" role="alert">
      <p>{preparationError}</p>
      <button onclick={() => activate()}>Retry video</button>
      <a
        href={`https://www.youtube.com/watch?v=${encodeURIComponent(id)}`}
        target="_blank"
        rel="noreferrer">Watch on YouTube</a
      >
    </div>
  {:else if active && blocked}
    <button class="inline-video-loading" onclick={() => activate(true)}
      >Play video</button
    >
  {:else if active && loading}
    <span class="inline-video-loading" role="status">Loading video…</span>
  {/if}
</div>
