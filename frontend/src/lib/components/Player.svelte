<script lang="ts">
  import {
    Play,
    Pause,
    SkipBack,
    SkipForward,
    ListMusic,
    ChevronUp,
    Volume2,
    Pencil,
    TvMinimalPlay,
    Music2,
  } from '@lucide/svelte';
  import * as Sheet from '$lib/components/ui/sheet';
  import * as Tabs from '$lib/components/ui/tabs';
  import { Button } from '$lib/components/ui/button';
  import Artwork from './Artwork.svelte';
  import Lyrics from './Lyrics.svelte';
  import VideoPreview from './VideoPreview.svelte';
  import { playback, nowPlaying } from '$lib/state';
  import {
    play,
    pause,
    prev,
    next,
    seek,
    setQueue,
  } from '$lib/core/player-store.js';
  import { clock } from '$lib/music';
  import { navigate } from '$lib/navigation';
  import type { Video } from '$lib/types';
  let tab = $state('listen'),
    preview = $state<Video | null>(null),
    volume = $state(80);
  const song = $derived($playback.song);
  const playing = $derived(
    $playback.status === 'playing' || $playback.status === 'loading',
  );
  const progress = $derived(
    $playback.duration
      ? Math.min(100, ($playback.currentTime / $playback.duration) * 100)
      : 0,
  );
  function toggle() {
    playing ? pause() : play();
  }
  function expand(value = 'listen') {
    tab = value;
    nowPlaying.set(true);
  }
</script>

{#if song}
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
          disabled={!song.isAvailable}
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
          disabled={!song.isAvailable}
          style={`--progress:${progress}%`}
        /><span>{clock($playback.duration)}</span>
      </div>
    </div>
    <div class="player-secondary">
      <button
        class="icon-control"
        aria-label="Show lyrics"
        onclick={() => expand('lyrics')}><Music2 size={18} /></button
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
        disabled={!song.isAvailable}
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
    ><Sheet.Content class="now-playing-sheet"
      ><Sheet.Header
        ><p class="eyebrow">A MOMENT FOR THE MUSIC</p>
        <Sheet.Title>Now playing</Sheet.Title><Sheet.Description
          >{song.name} · {song.artistName}</Sheet.Description
        ></Sheet.Header
      ><Tabs.Root bind:value={tab}
        ><Tabs.List class="now-playing-tabs"
          ><Tabs.Trigger value="listen">Listen</Tabs.Trigger><Tabs.Trigger
            value="lyrics">Lyrics</Tabs.Trigger
          ><Tabs.Trigger value="queue">Queue</Tabs.Trigger></Tabs.List
        ><Tabs.Content value="listen"
          ><div class="now-playing-art">
            <Artwork src={song.albumArt} size="large" />
          </div>
          <h2 class="now-playing-title">{song.name}</h2>
          <p class="muted">{song.artistName} · {song.albumName}</p>
          {#if !song.isAvailable}<p class="availability-note">
              Audio unavailable. Manage the audio source to make this song
              playable.
            </p>{/if}
          <div class="expanded-seek">
            <input
              type="range"
              min="0"
              max={$playback.duration || 1}
              step="0.1"
              value={$playback.currentTime}
              oninput={(e) => seek(Number(e.currentTarget.value))}
              aria-label="Seek in Now Playing"
              disabled={!song.isAvailable}
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
              aria-label="Previous song"
              onclick={prev}><SkipBack size={24} fill="currentColor" /></button
            ><button
              class="play-control"
              aria-label={playing ? 'Pause song' : 'Play song'}
              disabled={!song.isAvailable}
              onclick={toggle}
              >{#if playing}<Pause size={23} fill="currentColor" />{:else}<Play
                  size={23}
                  fill="currentColor"
                />{/if}</button
            ><button class="icon-control" aria-label="Next song" onclick={next}
              ><SkipForward size={24} fill="currentColor" /></button
            >
          </div>
          <div class="actions centered">
            <Button
              variant="ghost"
              onclick={() => {
                nowPlaying.set(false);
                navigate(`/songs/${encodeURIComponent(song.trackId)}/edit`);
              }}><Pencil size={15} />Edit song</Button
            >{#if song.youtubeVideoId}<Button
                variant="ghost"
                onclick={() =>
                  (preview = {
                    id: song.youtubeVideoId!,
                    title: song.name,
                    channelTitle: song.artistName,
                  })}><TvMinimalPlay size={17} />Audio source</Button
              >{/if}
          </div></Tabs.Content
        ><Tabs.Content value="lyrics"><Lyrics /></Tabs.Content><Tabs.Content
          value="queue"
          ><p class="small muted">
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
          </div></Tabs.Content
        ></Tabs.Root
      ></Sheet.Content
    ></Sheet.Root
  >
{/if}
<VideoPreview video={preview} onclose={() => (preview = null)} />
