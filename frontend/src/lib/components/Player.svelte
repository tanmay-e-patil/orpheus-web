<script lang="ts">
  import {
    Play,
    Pause,
    SkipBack,
    SkipForward,
    ListMusic,
    Volume2,
    Music2,
    ScrollText,
    X,
  } from '@lucide/svelte';
  import * as Sheet from '$lib/components/ui/sheet';
  import * as Tabs from '$lib/components/ui/tabs';
  import Artwork from './Artwork.svelte';
  import PlayerArtwork from './PlayerArtwork.svelte';
  import Lyrics from './Lyrics.svelte';
  import InlineVideo from './InlineVideo.svelte';
  import { playback, nowPlaying, notify } from '$lib/state';
  import {
    play,
    pause,
    prev,
    next,
    seek,
    setQueue,
  } from '$lib/core/player-store.js';
  import { clock } from '$lib/music';
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
    if (!$nowPlaying || tab === 'song') videoSongId = null;
    else if (tab === 'video' && song?.youtubeVideoId)
      videoSongId = song.trackId;
    else if (song?.trackId !== videoSongId) videoSongId = null;
  });
  function toggle() {
    playing ? pause() : play();
  }
  function expand(value = 'song') {
    panel = value === 'lyrics' || value === 'queue' ? value : null;
    if (!panel) tab = 'song';
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
    <div class="transport expanded">
      <button
        class="icon-control"
        aria-label="Show lyrics"
        aria-pressed={panel === 'lyrics'}
        aria-controls="player-lyrics"
        onclick={() => (panel = panel === 'lyrics' ? null : 'lyrics')}
        ><ScrollText size={20} /></button
      >
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
      <button
        class="icon-control"
        aria-label="Show queue"
        aria-pressed={panel === 'queue'}
        aria-controls="player-queue"
        onclick={() => (panel = panel === 'queue' ? null : 'queue')}
        ><ListMusic size={20} /></button
      >
    </div>
  {/snippet}
  <footer class="player-bar" aria-label="Music player">
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
    <div class="mini-progress" style={`width:${progress}%`}></div>
  </footer>
  <Sheet.Root bind:open={$nowPlaying}
    ><Sheet.Content class="now-playing-sheet" showCloseButton={false}
      ><PlayerArtwork
        src={song.albumArt}
        target={compactArtwork ? smallArtwork : largeArtwork}
      /><Sheet.Close
        class="icon-control now-playing-close"
        aria-label="Close player"><X size={20} /></Sheet.Close
      ><Sheet.Header
        ><Sheet.Title class="sr-only">Now playing</Sheet.Title
        ><Sheet.Description class="sr-only"
          >{song.name} · {song.artistName}</Sheet.Description
        ></Sheet.Header
      ><Tabs.Root bind:value={tab} class="now-playing-body"
        ><Tabs.List class="now-playing-tabs" aria-label="Now Playing sections"
          ><Tabs.Trigger value="song" onclick={() => (panel = null)}
            >Song</Tabs.Trigger
          ><Tabs.Trigger
            value="video"
            onclick={() => (panel = null)}
            disabled={!song.youtubeVideoId}>Video</Tabs.Trigger
          ></Tabs.List
        >
        <div class="now-playing-stage">
          <div class="now-playing-media-panels" class:auxiliary-open={!!panel}>
            <Tabs.Content value="song" class="now-playing-listen">
              <div class="now-playing-media">
                <div
                  bind:this={largeArtwork}
                  class="now-playing-artwork-large"
                  aria-hidden="true"
                ></div>
              </div>
            </Tabs.Content>
            <Tabs.Content value="video" class="now-playing-listen">
              <div class="now-playing-media showing-video">
                {#if videoSongId === song.trackId && song.youtubeVideoId}
                  {#key song.trackId}<InlineVideo
                      id={song.youtubeVideoId}
                      onerror={(message) => {
                        tab = 'song';
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
            <Lyrics visible={panel === 'lyrics' && $nowPlaying} />
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
      </Tabs.Root></Sheet.Content
    ></Sheet.Root
  >
{/if}
