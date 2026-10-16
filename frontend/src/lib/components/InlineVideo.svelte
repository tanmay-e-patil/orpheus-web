<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { Maximize2, Minimize2 } from '@lucide/svelte';
  import { createLandscapeLock } from '$lib/video-orientation';
  import { loadYouTube, type YouTubePlayer } from '$lib/youtube';
  import { createVideoPlayback } from '$lib/video-playback';
  import { errorMessage } from '$lib/state';
  import {
    recordFullscreen,
    requestFullscreenWithDiagnostics,
  } from '$lib/fullscreen-diagnostics';
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
  // iPhone supports native video fullscreen, not fullscreening our div.
  // YouTube owns the cross-origin video and selects that path via playsinline.
  const nativeVideoFullscreen = /iPhone|iPod/.test(navigator.userAgent);
  let cleanupFullscreenDiagnostics: (() => void) | undefined;
  let container: HTMLDivElement;
  let target: HTMLDivElement;
  let fullscreen = $state(false);
  let fullscreenRequest = 0;
  let cancelFullscreen = false;
  const mobile = /iPhone|iPod|iPad|Android/.test(navigator.userAgent);
  const landscape = createLandscapeLock((stage, detail) =>
    recordFullscreen(stage, container, { detail }),
  );
  let loading = $state(true);
  let blocked = $state(false);
  let preparationError = '';
  let player: YouTubePlayer | undefined;
  let ready = false;
  let playback: ReturnType<typeof createVideoPlayback> | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;

  function fail(message: string) {
    clearTimeout(timeout);
    landscape.release();
    playback?.fail();
    playback = undefined;
    preparationError = message;
    if (active) onerror(message);
  }

  function currentFullscreen() {
    return (
      document.fullscreenElement ??
      (document as Document & { webkitFullscreenElement?: Element })
        .webkitFullscreenElement
    );
  }

  function fullscreenChanged() {
    const element = currentFullscreen();
    fullscreen = !!element && container.contains(element);
    if (fullscreen) {
      if (!active || cancelFullscreen) exitFullscreen();
      else if (mobile) landscape.request();
    } else landscape.release();
  }

  async function enterFullscreen() {
    cancelFullscreen = false;
    const request = ++fullscreenRequest;
    cleanupFullscreenDiagnostics?.();
    recordFullscreen('activation-before-tick', container);
    await tick();
    if (request !== fullscreenRequest || !active || !container?.isConnected) {
      recordFullscreen('cancelled-before-request', container, { active });
      return;
    }
    if (currentFullscreen() === container) return;
    cleanupFullscreenDiagnostics = requestFullscreenWithDiagnostics(container);
  }

  function exitFullscreen() {
    cancelFullscreen = true;
    fullscreenRequest++;
    landscape.release();
    const doc = document as Document & {
      webkitFullscreenElement?: Element;
      webkitExitFullscreen?: () => Promise<void> | void;
    };
    const fullscreen = doc.fullscreenElement ?? doc.webkitFullscreenElement;
    if (!fullscreen || !container?.contains(fullscreen)) return;
    try {
      const exit = doc.exitFullscreen ?? doc.webkitExitFullscreen;
      void Promise.resolve(exit?.call(doc)).catch(() => {});
    } catch {
      // The browser may already be leaving fullscreen during cleanup.
    }
  }

  function toggleFullscreen() {
    const element = currentFullscreen();
    if (element && container.contains(element)) exitFullscreen();
    else void enterFullscreen();
  }

  // Called synchronously from the Video tab click, before Svelte updates it.
  export function activate(fullscreen = false) {
    if (preparationError) {
      onerror(preparationError);
      return;
    }
    if (fullscreen) {
      if (nativeVideoFullscreen)
        recordFullscreen('native-video-fullscreen-delegated', container, {
          playsinline: 0,
        });
      else void enterFullscreen();
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
    // A hidden seek can start native video fullscreen on iPhone. Preparing
    // the iframe is safe; media seeks must wait for explicit activation.
    if (nativeVideoFullscreen || !ready || !player || playback) return;
    // seekTo requests media, unlike merely cueing a thumbnail. Keep the
    // prepared player paused; buffering while paused is controlled by YouTube.
    player.seekTo(getPlayerState().currentTime, true);
    player.pauseVideo();
  }

  function deactivate() {
    exitFullscreen();
    cleanupFullscreenDiagnostics?.();
    cleanupFullscreenDiagnostics = undefined;
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
    document.addEventListener('fullscreenchange', fullscreenChanged);
    document.addEventListener('webkitfullscreenchange', fullscreenChanged);
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
            playsinline: nativeVideoFullscreen ? 0 : 1,
            rel: 0,
            controls: 1,
            // One owner per platform. An iframe toggle cannot exit a fullscreen
            // layer created by its parent, so use our toggle for HTML fullscreen.
            fs: nativeVideoFullscreen ? 1 : 0,
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
              if (event.data === 1) {
                blocked = false;
                if (nativeVideoFullscreen) landscape.request();
              } else if (nativeVideoFullscreen && event.data === 2)
                landscape.release();
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
              landscape.release();
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
    const preparationTimer = nativeVideoFullscreen
      ? undefined
      : setInterval(prepare, 5000);
    return () => {
      destroyed = true;
      deactivate();
      document.removeEventListener('fullscreenchange', fullscreenChanged);
      document.removeEventListener('webkitfullscreenchange', fullscreenChanged);
      clearInterval(timer);
      clearInterval(preparationTimer);
      player?.destroy();
    };
  });
</script>

<div bind:this={container} class="inline-video" aria-busy={active && loading}>
  <div class="inline-video-mount"><div bind:this={target}></div></div>
  {#if active && !nativeVideoFullscreen}
    <button
      class="inline-video-fullscreen"
      aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
      title={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
      onclick={toggleFullscreen}
    >
      {#if fullscreen}<Minimize2 size={20} />{:else}<Maximize2 size={20} />{/if}
    </button>
  {/if}
  {#if active && blocked}
    <button class="inline-video-loading" onclick={() => activate(true)}
      >Play video</button
    >
  {:else if active && loading}
    <span class="inline-video-loading" role="status">Loading video…</span>
  {/if}
</div>
