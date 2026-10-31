<script lang="ts">
  import { notify } from '$lib/notifications';
  import { onMount } from 'svelte';
  import {
    ArrowLeft,
    Play,
    Search,
    RefreshCw,
    Check,
    Music2,
  } from '@lucide/svelte';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Textarea } from '$lib/components/ui/textarea';
  import * as Dialog from '$lib/components/ui/dialog';
  import Artwork from '$lib/components/Artwork.svelte';
  import VideoPreview from '$lib/components/VideoPreview.svelte';
  import { api } from '$lib/api';
  import { errorMessage, session, libraryVersion } from '$lib/state';
  import {
    setQueue,
    updateQueueSong,
    updateSongLyrics,
  } from '$lib/core/player-store.js';
  import { clearSongsCache } from '$lib/core/idb-song-cache.js';
  import {
    duration,
    syntheticVideo,
    sourceWarning,
    adjustLrc,
  } from '$lib/music';
  import type {
    Song,
    Video,
    Track,
    LyricsOption,
    SongDetail,
  } from '$lib/types';
  let { id }: { id: string } = $props();
  let song = $state<Song | null>(null),
    source = $state<Video | null>(null),
    loading = $state(true),
    busy = $state(false),
    error = $state('');
  let metadata = $state({
    name: '',
    artistName: '',
    albumName: '',
    albumArt: '',
    releaseDate: '',
  });
  let query = $state(''),
    lyricsQuery = $state(''),
    candidates = $state<Track[]>([]),
    videos = $state<Video[]>([]),
    options = $state<LyricsOption[]>([]);
  let plain = $state(''),
    synced = $state(''),
    offset = $state(0),
    preview = $state<Video | null>(null),
    previewLyrics = $state('');
  let confirmation = $state<{
    title: string;
    description: string;
    action: () => Promise<void>;
  } | null>(null);
  let disposed = false;
  let poll: ReturnType<typeof setInterval>;
  const fields: {
    key: keyof typeof metadata;
    label: string;
    required?: boolean;
  }[] = [
    { key: 'name', label: 'Song title', required: true },
    { key: 'artistName', label: 'Artist', required: true },
    { key: 'albumName', label: 'Album', required: true },
    { key: 'releaseDate', label: 'Release date' },
    { key: 'albumArt', label: 'Artwork URL' },
  ];
  async function load() {
    try {
      const data = await api.song(id);
      if (disposed) return;
      song = data.song;
      source = data.audioSource;
      metadata = {
        name: song.name,
        artistName: song.artistName,
        albumName: song.albumName,
        albumArt: song.albumArt || '',
        releaseDate: '',
      };
      query = `${song.name} ${song.artistName}`;
      plain = song.lyrics || '';
      synced = song.syncedLyrics || '';
    } catch (e) {
      error = errorMessage(e);
    } finally {
      loading = false;
    }
  }
  onMount(() => {
    load();
    poll = setInterval(async () => {
      if (!song || song.isAvailable || busy) return;
      try {
        const data = await api.song(id);
        if (!disposed && data.song.isAvailable) {
          song = data.song;
          source = data.audioSource;
          updateQueueSong(id, song);
          notify('Your audio is ready.', 'success');
        }
      } catch {
        /* A later interval retries transient polling failures. */
      }
    }, 4000);
    return () => {
      disposed = true;
      clearInterval(poll);
    };
  });
  async function run(action: () => Promise<void>) {
    if (busy) return;
    busy = true;
    error = '';
    try {
      await action();
    } catch (e) {
      error = errorMessage(e);
    } finally {
      busy = false;
    }
  }
  async function invalidate() {
    await clearSongsCache($session?.user?.id || 'single-user').catch(() => {});
    libraryVersion.update((n) => n + 1);
  }
  async function mutate(action: () => Promise<SongDetail>, message: string) {
    await run(async () => {
      const data = await action();
      if (disposed) return;
      song = data.song;
      source = data.audioSource;
      updateQueueSong(id, data.song);
      await invalidate();
      notify(
        data.fileUpdateQueued
          ? `${message} Library file update queued.`
          : message,
        'success',
      );
    });
  }
  async function findMetadata() {
    if (!song) return;
    await run(async () => {
      const q = `${metadata.name} ${metadata.artistName} ${metadata.albumName}`;
      candidates = (
        await api.customDeezerMatch({ ...syntheticVideo(song!), title: q }, q)
      ).trackMatches;
      if (!candidates.length) notify('No matching song information found.');
    });
  }
  async function findVideos(event: SubmitEvent) {
    event.preventDefault();
    await run(async () => {
      videos = await api.discoverYouTube(query);
    });
  }
  function replaceSource(video: Video) {
    const warning = sourceWarning(song?.duration, video.duration);
    confirmation = {
      title: 'Replace the audio source?',
      description: `${warning ? warning + ' ' : ''}The audio file will be regenerated from this video.`,
      action: () =>
        mutate(
          () => api.replaceAudioSource(id, video),
          'Audio source replaced.',
        ),
    };
  }
  async function findLyrics(custom = false) {
    if (!song) return;
    const track = {
      id,
      name: song.name,
      artist: song.artistName,
      album: song.albumName,
      albumImageUrl: song.albumArt,
      releaseDate: '',
    };
    await run(async () => {
      options = (
        custom
          ? await api.customLyricsSearch(track, lyricsQuery)
          : await api.lyricsOptions(track)
      ).options;
      if (!options.length) notify('No lyrics found. Try another search.');
    });
  }
  async function saveLyrics(nextPlain = plain, nextSynced = synced) {
    await run(async () => {
      await api.saveLyrics(id, nextPlain, nextSynced);
      plain = nextPlain;
      synced = nextSynced;
      offset = 0;
      if (song) song = { ...song, lyrics: plain, syncedLyrics: synced };
      updateSongLyrics(id, plain, synced);
      await invalidate();
      notify('Lyrics saved.', 'success');
    });
  }
  function testLyrics(lyrics: string) {
    const videoId = song?.youtubeVideoId || source?.id;
    if (!videoId) {
      notify('No audio source is linked to this song.', 'error');
      return;
    }
    preview = {
      id: videoId,
      title: song?.name || 'Lyrics timing preview',
      channelTitle: song?.artistName,
    };
    previewLyrics = lyrics;
  }
</script>

<section class="page editor-page">
  <a href="/home" class="back-link"
    ><ArrowLeft size={16} />Back to your library</a
  >
  {#if loading}<p class="loading-note" role="status">
      Opening song…
    </p>{:else if song}
    <header class="editor-heading">
      <Artwork src={song.albumArt} size="large" />
      <div>
        <p class="eyebrow">IN YOUR COLLECTION</p>
        <h1>{song.name}</h1>
        <p class="muted">{song.artistName} · {song.albumName}</p>
        <div class="actions">
          <span class="availability" class:ready={song.isAvailable}
            ><span></span>{song.isAvailable
              ? 'Audio ready'
              : 'Audio unavailable'}</span
          >{#if song.isAvailable}<Button
              variant="outline"
              onclick={() => setQueue([song!], 0)}
              ><Play size={15} />Play song</Button
            >{/if}
        </div>
      </div>
    </header>
    {#if error}<p class="error-message" role="alert">{error}</p>{/if}
    <form
      class="editor-section"
      onsubmit={(e) => {
        e.preventDefault();
        mutate(
          () => api.updateSongMetadata(id, metadata),
          'Song information saved.',
        );
      }}
    >
      <div class="section-heading">
        <div>
          <p class="eyebrow">01 / THE DETAILS</p>
          <h2>Song metadata</h2>
          <p class="muted">Give your song the right name, artist, and home.</p>
        </div>
      </div>
      <div class="form-grid">
        {#each fields as field}<label
            >{field.label}<Input
              bind:value={metadata[field.key]}
              required={field.required}
              placeholder={field.key === 'releaseDate'
                ? 'YYYY or YYYY-MM-DD; blank keeps the current date'
                : ''}
            /></label
          >{/each}<label
          >Duration<Input value={duration(song.duration)} readonly /></label
        >
      </div>
      <div class="actions split">
        <Button variant="ghost" disabled={busy} onclick={findMetadata}
          ><Search size={15} />Find matching song info</Button
        ><Button type="submit" disabled={busy}
          >Save song info<Check size={15} /></Button
        >
      </div>
      {#if candidates.length}<div class="choice-list">
          {#each candidates as candidate}<div class="candidate-row">
              <Artwork src={candidate.albumImageUrl} /><span
                ><strong>{candidate.name}</strong><small
                  >{candidate.artist} · {candidate.album}</small
                ></span
              ><Button
                variant="outline"
                onclick={() => {
                  metadata = {
                    name: candidate.name,
                    artistName: candidate.artist,
                    albumName: candidate.album,
                    albumArt: candidate.albumImageUrl || '',
                    releaseDate: candidate.releaseDate || '',
                  };
                  candidates = [];
                  notify('Song information applied. Save when you’re ready.');
                }}>Use info</Button
              >
            </div>{/each}
        </div>{/if}
    </form>
    <details class="editor-section">
      <summary
        ><span
          ><span class="eyebrow">02 / THE SOUND</span>
          <h2>Audio source</h2>
          <span class="muted"
            >{source?.title || 'Find a source for this song'}</span
          ></span
        ></summary
      >
      <div class="details-body">
        <form class="inline-search" onsubmit={findVideos}>
          <Input
            aria-label="Search for a replacement audio source"
            bind:value={query}
            required
          /><Button variant="outline" type="submit" disabled={busy}
            >Search YouTube</Button
          >
        </form>
        <div class="choice-list">
          {#each videos as video}<div class="source-result">
              <Artwork src={video.thumbnail} />
              <div>
                <strong>{video.title}</strong>
                <p class="muted">
                  {video.channelTitle} · {duration(video.duration)}
                </p>
                {#if sourceWarning(song.duration, video.duration)}<small
                    class="warning"
                    >{sourceWarning(song.duration, video.duration)}</small
                  >{/if}
                <div class="actions">
                  <Button
                    variant="ghost"
                    onclick={() => {
                      preview = video;
                      previewLyrics = '';
                    }}><Play size={14} />Preview</Button
                  ><Button
                    variant="outline"
                    disabled={busy || video.id === song.youtubeVideoId}
                    onclick={() => replaceSource(video)}
                    >{video.id === song.youtubeVideoId
                      ? 'Current source'
                      : 'Use this source'}</Button
                  >
                </div>
              </div>
            </div>{/each}
        </div>
      </div>
    </details>
    <details class="editor-section">
      <summary
        ><span
          ><span class="eyebrow">03 / THE WORDS</span>
          <h2>Lyrics</h2>
          <span class="muted"
            >{synced
              ? 'Synced lyrics available'
              : plain
                ? 'Lyrics available'
                : 'Add the words that make the song'}</span
          ></span
        ></summary
      >
      <div class="details-body">
        <div class="actions">
          <Button variant="outline" disabled={busy} onclick={() => findLyrics()}
            ><Search size={15} />Find lyrics</Button
          >
        </div>
        <form
          class="inline-search"
          onsubmit={(e) => {
            e.preventDefault();
            findLyrics(true);
          }}
        >
          <Input
            aria-label="Custom lyrics search"
            placeholder="Try another song or artist…"
            bind:value={lyricsQuery}
            required
          /><Button variant="outline" type="submit" disabled={busy}
            >Search</Button
          >
        </form>
        {#each options as option}<article class="lyrics-choice">
            <h3>{option.trackName} · {option.artistName}</h3>
            <pre>{(option.syncedLyrics || option.plainLyrics || '')
                .split('\n')
                .slice(0, 6)
                .join('\n')}</pre>
            <div class="actions">
              {#if option.syncedLyrics}<Button
                  variant="ghost"
                  onclick={() => testLyrics(option.syncedLyrics || '')}
                  >Test timing</Button
                >{/if}<Button
                variant="outline"
                disabled={busy}
                onclick={() =>
                  saveLyrics(
                    option.plainLyrics || '',
                    option.syncedLyrics || '',
                  )}>Save these lyrics</Button
              >
            </div>
          </article>{/each}
        <form
          class="form-stack"
          onsubmit={(e) => {
            e.preventDefault();
            saveLyrics();
          }}
        >
          <label>Lyrics<Textarea bind:value={plain} rows={8} /></label><label
            >Synced lyrics<Textarea bind:value={synced} rows={8} /></label
          >
          <div class="actions">
            {#if synced}<Button
                variant="ghost"
                onclick={() => testLyrics(synced)}
                ><Play size={14} />Test lyrics timing</Button
              >{/if}<Button type="submit" disabled={busy}
              >Save lyrics<Check size={15} /></Button
            >
          </div>
        </form>
        {#if synced}<div class="timing-adjustment">
            <h3>Timing adjustment</h3>
            <p class="muted">
              Shift all synced lines together. Positive values delay the lyrics.
            </p>
            <div class="actions">
              {#each [-1, -0.5, 0.5, 1] as n}<Button
                  variant="outline"
                  onclick={() => (offset += n)}>{n > 0 ? '+' : ''}{n}s</Button
                >{/each}<label class="offset-field"
                >Offset (seconds)<Input
                  type="number"
                  step="0.01"
                  bind:value={offset}
                /></label
              >
            </div>
            <pre class="timing-preview">{adjustLrc(synced, offset)}</pre>
            <div class="actions">
              <Button
                variant="ghost"
                onclick={() => testLyrics(adjustLrc(synced, offset))}
                >Preview adjusted timing</Button
              ><Button
                disabled={busy || !offset}
                onclick={() => saveLyrics(plain, adjustLrc(synced, offset))}
                >Save adjusted timing</Button
              >
            </div>
          </div>{/if}
      </div>
    </details>
    <details class="editor-section advanced-section">
      <summary
        ><span
          ><span class="eyebrow">ADVANCED</span>
          <h2>Audio file regeneration</h2></span
        ></summary
      >
      <div class="details-body">
        <p class="muted">
          Rebuild the audio file from the current audio source. The song will be
          unavailable until processing finishes.
        </p>
        <Button
          variant="outline"
          disabled={busy}
          onclick={() =>
            (confirmation = {
              title: 'Regenerate this audio file?',
              description:
                'Playback will be unavailable until the audio file has finished processing.',
              action: () =>
                mutate(
                  () => api.regenerateSong(id),
                  'Audio regeneration requested.',
                ),
            })}><RefreshCw size={16} />Regenerate audio file</Button
        >
      </div>
    </details>
  {:else}<div class="empty">
      <h1>Couldn’t open this song</h1>
      <p class="error-message" role="alert">{error}</p>
      <Button variant="outline" onclick={load}>Try again</Button>
    </div>{/if}
</section>
<VideoPreview
  video={preview}
  lyrics={previewLyrics}
  onclose={() => (preview = null)}
/>
<Dialog.Root
  open={!!confirmation}
  onOpenChange={(open) => {
    if (!open) confirmation = null;
  }}
  ><Dialog.Content
    ><Dialog.Header
      ><Dialog.Title>{confirmation?.title || 'Confirm action'}</Dialog.Title
      ><Dialog.Description>{confirmation?.description}</Dialog.Description
      ></Dialog.Header
    >
    <div class="actions">
      <Button variant="outline" onclick={() => (confirmation = null)}
        >Cancel</Button
      ><Button
        disabled={busy}
        onclick={async () => {
          const action = confirmation?.action;
          confirmation = null;
          await action?.();
        }}>Continue</Button
      >
    </div></Dialog.Content
  ></Dialog.Root
>
