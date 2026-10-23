<script lang="ts">
  import { onDestroy } from 'svelte';
  import { fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import {
    Play,
    Pause,
    SkipBack,
    SkipForward,
    ListMusic,
    Volume2,
    Music2,
    ScrollText,
    ChevronDown,
    PanelRightClose,
  } from '@lucide/svelte';
  import * as Sheet from '$lib/components/ui/sheet';
  import * as Tabs from '$lib/components/ui/tabs';
  import Artwork from './Artwork.svelte';
  import PlayerArtwork from './PlayerArtwork.svelte';
  import PlayerGlow from './PlayerGlow.svelte';
  import Lyrics from './Lyrics.svelte';
  import InlineVideo from './InlineVideo.svelte';
  import {
    playback,
    nowPlaying,
    dockedPlayer,
    playerPaneCollapsed,
    videoDockedLayout,
    notify,
  } from '$lib/state';
  import {
    play,
    pause,
    prev,
    next,
    seek,
    setQueue,
  } from '$lib/core/player-store.js';
  import { clock } from '$lib/music';
  import { playerDismiss } from '$lib/player-dismiss';
  let videoComponent: { activate(fullscreen?: boolean): void } | undefined =
    $state();
  const visible = $derived($dockedPlayer || $nowPlaying);
  let playerSheet = $state<HTMLElement | null>(null);
  $effect(() => {
    if (playerSheet && $nowPlaying && !$dockedPlayer)
      return playerDismiss(playerSheet, () => nowPlaying.set(false));
  });
  let panel = $state<'lyrics' | 'queue' | null>(null);
  let tab = $state('song'),
    videoSongId = $state<string | null>(null),
    volume = $state(80);
  let largeArtwork: HTMLDivElement | undefined = $state();
  let smallArtwork: HTMLDivElement | undefined = $state();
  const compactArtwork = $derived(!!panel || tab === 'video');
  const song = $derived($playback.song);
  const canPlay = $derived(
    !!song && (song.isAvailable || videoSongId === song.trackId),
  );
  const playing = $derived(
    $playback.status === 'playing' || $playback.status === 'loading',
  );
  const progress = $derived(
    $playback.duration
      ? Math.min(100, ($playback.currentTime / $playback.duration) * 100)
      : 0,
  );
  $effect(() => {
    if (!visible || tab === 'song') videoSongId = null;
    else if (tab === 'video' && song?.youtubeVideoId)
      videoSongId = song.trackId;
    else if (song?.trackId !== videoSongId) videoSongId = null;
  });
  $effect(() => {
    if (tab !== 'video' || !visible) videoDockedLayout.set(null);
  });
  onDestroy(() => videoDockedLayout.set(null));
  function playerMotion(node: Element, { pane = false } = {}) {
    return fly(node, {
      x: pane ? node.getBoundingClientRect().width : 0,
      y: pane ? 0 : 20,
      opacity: pane ? 1 : 0,
      duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 0
        : pane
          ? 320
          : 180,
      easing: cubicOut,
    });
  }
  function toggle() {
    playing ? pause() : play();
  }
  function expand(value = 'song') {
    panel = value === 'lyrics' || value === 'queue' ? value : null;
    if (!panel) tab = 'song';
    playerPaneCollapsed.set(false);
    nowPlaying.set(true);
  }
</script>

{#if song}
  {#snippet songControls()}
    <div class="now-playing-song-details">
      {#if compactArtwork}<div
          bind:this={smallArtwork}
          class="now-playing-artwork-small"
          aria-hidden="true"
        ></div>{/if}
      <div class="now-playing-metadata">
        <h2 class="now-playing-title">{song.name}</h2>
        <p class="muted">{song.artistName} · {song.albumName}</p>
        {#if !song.isAvailable && !videoSongId}<p class="availability-note">
            Audio unavailable.{song.youtubeVideoId
              ? ' Open the Video tab to listen on YouTube.'
              : ''}
          </p>{/if}
      </div>
    </div>
    <div class="expanded-seek">
      <input
        type="range"
        min="0"
        max={$playback.duration || 1}
        step="0.1"
        value={$playback.currentTime}
        oninput={(e) => seek(Number(e.currentTarget.value))}
        aria-label="Seek in Now Playing"
        disabled={!canPlay}
        style={`--progress:${progress}%`}
      />
      <div>
        <span>{clock($playback.currentTime)}</span><span
          >{clock($playback.duration)}</span
        >
      </div>
    </div>
    <div class="now-playing-actions">
      <div class="transport expanded">
        <button class="icon-control" aria-label="Previous song" onclick={prev}
          ><SkipBack size={24} fill="currentColor" /></button
        ><button
          class="play-control"
          aria-label={playing ? 'Pause song' : 'Play song'}
          disabled={!canPlay}
          onclick={toggle}
          >{#if playing}<Pause size={23} fill="currentColor" />{:else}<Play
              size={23}
              fill="currentColor"
            />{/if}</button
        ><button class="icon-control" aria-label="Next song" onclick={next}
          ><SkipForward size={24} fill="currentColor" /></button
        >
      </div>
      <div class="now-playing-utilities">
        <button
          class="icon-control now-playing-lyrics-toggle"
          aria-label="Show lyrics"
          aria-pressed={panel === 'lyrics'}
          aria-controls="player-lyrics"
          onclick={() => (panel = panel === 'lyrics' ? null : 'lyrics')}
          ><ScrollText size={20} /></button
        >
        <button
          class="icon-control now-playing-queue-toggle"
          aria-label="Show queue"
          aria-pressed={panel === 'queue'}
          aria-controls="player-queue"
          onclick={() => (panel = panel === 'queue' ? null : 'queue')}
          ><ListMusic size={20} /></button
        >
      </div>
    </div>
    {#if $dockedPlayer}
      <div class="dock-volume">
        <Volume2 size={16} />
        <input
          type="range"
          min="0"
          max="100"
          bind:value={volume}
          aria-label="Volume"
          style={`--progress:${volume}%`}
          oninput={(e) =>
            $playback.controller?.setVolume(Number(e.currentTarget.value))}
        />
      </div>
    {/if}
  {/snippet}
  {#if !$dockedPlayer && !$nowPlaying}
    <footer
      class="player-bar"
      aria-label="Music player"
      transition:playerMotion
      inert={$dockedPlayer || $nowPlaying}
      aria-hidden={$dockedPlayer || $nowPlaying}
    >
      <button
        class="player-bar-open"
        aria-label="Expand Now Playing"
        onclick={() => expand()}
      ></button>
      <button
        class="mini-song"
        onclick={() => expand()}
        aria-label={`Open Now Playing: ${song.name}`}
        ><Artwork src={song.albumArt} /><span
          ><strong>{song.name}</strong><small>{song.artistName}</small></span
        ></button
      >
      <div class="desktop-playback">
        <div class="transport">
          <button class="icon-control" aria-label="Previous song" onclick={prev}
            ><SkipBack size={17} fill="currentColor" /></button
          ><button
            class="play-control"
            aria-label={playing ? 'Pause' : 'Play'}
            disabled={!canPlay}
            onclick={toggle}
            >{#if playing}<Pause size={17} fill="currentColor" />{:else}<Play
                size={17}
                fill="currentColor"
              />{/if}</button
          ><button class="icon-control" aria-label="Next song" onclick={next}
            ><SkipForward size={17} fill="currentColor" /></button
          >
        </div>
        <div class="seek-row">
          <span>{clock($playback.currentTime)}</span><input
            type="range"
            min="0"
            max={$playback.duration || 1}
            step="0.1"
            value={$playback.currentTime}
            oninput={(e) => seek(Number(e.currentTarget.value))}
            aria-label="Seek playback"
            disabled={!canPlay}
            style={`--progress:${progress}%`}
          /><span>{clock($playback.duration)}</span>
        </div>
      </div>
      <div class="player-secondary">
        <button
          class="icon-control"
          aria-label="Show lyrics"
          onclick={() => expand('lyrics')}><ScrollText size={18} /></button
        ><button
          class="icon-control"
          aria-label="Show queue"
          onclick={() => expand('queue')}><ListMusic size={19} /></button
        ><Volume2 size={16} /><input
          type="range"
          min="0"
          max="100"
          bind:value={volume}
          aria-label="Volume"
          oninput={(e) =>
            $playback.controller?.setVolume(Number(e.currentTarget.value))}
        />
      </div>
      <div class="mobile-playback">
        <button
          class="icon-control"
          aria-label={playing ? 'Pause' : 'Play'}
          disabled={!canPlay}
          onclick={toggle}
          >{#if playing}<Pause size={22} fill="currentColor" />{:else}<Play
              size={22}
              fill="currentColor"
            />{/if}</button
        ><button class="icon-control" aria-label="Next song" onclick={next}
          ><SkipForward size={19} /></button
        >
      </div>
      <input
        class="mini-progress"
        type="range"
        min="0"
        max={$playback.duration || 1}
        step="0.1"
        value={$playback.currentTime}
        aria-label="Seek playback in mini-player"
        disabled={!canPlay}
        style={`--progress:${progress}%`}
        oninput={(e) => seek(Number(e.currentTarget.value))}
      />
    </footer>
  {/if}
  {#snippet playerContent()}
    <PlayerGlow src={song.albumArt} />
    <PlayerArtwork
      src={song.albumArt}
      target={compactArtwork ? smallArtwork : largeArtwork}
    />
    <Tabs.Root
      bind:value={tab}
      class={`now-playing-body${compactArtwork ? '' : ' artwork-view'}`}
      ><div class="now-playing-header" data-player-drag-region>
        <button
          class="icon-control now-playing-close"
          aria-label={$dockedPlayer ? 'Collapse Now Playing' : 'Close player'}
          onclick={() => {
            videoDockedLayout.set(null);
            if ($dockedPlayer) playerPaneCollapsed.set(true);
            nowPlaying.set(false);
          }}
          >{#if $dockedPlayer}<PanelRightClose size={20} />{:else}<ChevronDown
              size={24}
            />{/if}</button
        >
        <Tabs.List class="now-playing-tabs" aria-label="Now Playing sections"
          ><Tabs.Trigger value="song" onclick={() => (panel = null)}
            >Song</Tabs.Trigger
          ><Tabs.Trigger
            value="video"
            onclick={() => {
              panel = null;
              videoDockedLayout.set($dockedPlayer);
              tab = 'video';
              videoComponent?.activate(true);
            }}
            disabled={!song.youtubeVideoId}>Video</Tabs.Trigger
          ></Tabs.List
        >
      </div>
      <div class="now-playing-stage">
        <div class="now-playing-media-panels" class:auxiliary-open={!!panel}>
          <Tabs.Content value="song" class="now-playing-listen">
            <div class="now-playing-media" data-player-drag-region>
              <div
                bind:this={largeArtwork}
                class="now-playing-artwork-large"
                aria-hidden="true"
              ></div>
            </div>
          </Tabs.Content>
          <Tabs.Content
            value="video"
            class="now-playing-listen"
            hidden={tab !== 'video' || !!panel}
          >
            <div class="now-playing-media showing-video">
              {#if song.youtubeVideoId}
                {#key song.trackId}<InlineVideo
                    bind:this={videoComponent}
                    active={visible && tab === 'video'}
                    id={song.youtubeVideoId}
                    onerror={(message) => {
                      videoSongId = null;
                      notify(message, 'error');
                    }}
                  />{/key}
              {/if}
            </div>
          </Tabs.Content>
        </div>
        <section
          id="player-lyrics"
          aria-label="Lyrics"
          class="now-playing-lyrics"
          hidden={panel !== 'lyrics'}
        >
          <Lyrics visible={panel === 'lyrics' && visible} />
        </section>
        <section
          id="player-queue"
          aria-label="Queue"
          class="now-playing-queue"
          hidden={panel !== 'queue'}
        >
          <p class="small muted">
            {$playback.queue.length} songs in this listening session
          </p>
          <div class="queue-list">
            {#each $playback.queue as queued, index}<button
                class:current={index === $playback.currentIndex}
                onclick={() => setQueue($playback.queue, index)}
                ><Artwork src={queued.albumArt} size="small" /><span
                  ><strong>{queued.name}</strong><small
                    >{queued.artistName}</small
                  ></span
                >{#if index === $playback.currentIndex}<Music2
                    size={16}
                  />{/if}</button
              >{/each}
          </div>
        </section>
      </div>
      <div class="now-playing-controls">{@render songControls()}</div>
    </Tabs.Root>
  {/snippet}
  {#if $dockedPlayer}
    <aside
      class="now-playing-sheet now-playing-dock"
      aria-label="Now Playing"
      transition:playerMotion={{ pane: true }}
      inert={!$dockedPlayer}
      aria-hidden={!$dockedPlayer}
    >
      {@render playerContent()}
    </aside>
  {:else}
    <Sheet.Root bind:open={$nowPlaying}>
      <Sheet.Content
        forceMount
        preventScroll={$nowPlaying}
        style={$nowPlaying ? undefined : 'display: none;'}
        bind:ref={playerSheet}
        side="bottom"
        class="now-playing-sheet"
        showCloseButton={false}
      >
        <Sheet.Header class="sr-only">
          <Sheet.Title>Now playing</Sheet.Title>
          <Sheet.Description>{song.name} · {song.artistName}</Sheet.Description>
        </Sheet.Header>
        {@render playerContent()}
      </Sheet.Content>
    </Sheet.Root>
  {/if}
{/if}
