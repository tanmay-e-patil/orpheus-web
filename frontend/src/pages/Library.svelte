<script lang="ts">
  import { onMount } from 'svelte';
  import {
    Search,
    Plus,
    MoreHorizontal,
    Play,
    Pencil,
    Trash2,
    Disc3,
    ArrowDownUp,
    ChevronDown,
  } from '@lucide/svelte';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import { Skeleton } from '$lib/components/ui/skeleton';
  import DeleteSongDialog from '$lib/components/DeleteSongDialog.svelte';
  import { onSongDeleted } from '$lib/song-deletion';
  import Artwork from '$lib/components/Artwork.svelte';
  import { api } from '$lib/api';
  import { session, playback, libraryVersion, errorMessage } from '$lib/state';
  import { navigate } from '$lib/navigation';
  import {
    setQueue,
    updateQueueSong,
    updateSongAlbumArt,
  } from '$lib/core/player-store.js';
  import {
    readAllCachedSongs,
    upsertSongsPage,
    writeSongsCacheMeta,
  } from '$lib/core/idb-song-cache.js';
  import { duration, searchSongs } from '$lib/music';
  import type { Song } from '$lib/types';
  let deleting = $state<Song | null>(null);
  let loadController: AbortController | undefined;
  let songs = $state<Song[]>([]),
    query = $state(new URLSearchParams(location.search).get('q') || '');
  let sort = $state(
    new URLSearchParams(location.search).get('sort') || 'recentlyAdded',
  );
  let loading = $state(true),
    hydrating = $state(false),
    error = $state(''),
    limit = $state(100);
  let observer: IntersectionObserver | undefined;
  let boundary: HTMLDivElement;
  let artTimer: ReturnType<typeof setTimeout>;
  let disposed = false;
  const failedArtwork = new Set<string>();
  const refreshedArtwork = new Set<string>();
  function refreshArtwork(id: string) {
    if (refreshedArtwork.has(id)) return;
    failedArtwork.add(id);
    clearTimeout(artTimer);
    artTimer = setTimeout(async () => {
      const ids = [...failedArtwork];
      failedArtwork.clear();
      ids.forEach((id) => refreshedArtwork.add(id));
      try {
        const { updated } = await api.refreshAlbumArt(ids);
        if (disposed) return;
        songs = songs.map((song) =>
          updated[song.trackId]
            ? { ...song, albumArt: updated[song.trackId] }
            : song,
        );
        Object.entries(updated).forEach(([id, src]) =>
          updateSongAlbumArt(id, src),
        );
      } catch {
        /* Placeholder artwork remains available when refresh is offline. */
      }
    }, 300);
  }
  const searchShortcut = /Mac|iPhone|iPad/.test(navigator.platform)
    ? '⌘ K'
    : 'Ctrl K';
  const sortOptions = [
    { value: 'recentlyAdded', label: 'Recently added' },
    { value: 'artist', label: 'Artist A–Z' },
    { value: 'mostPlayed', label: 'Most played' },
  ];
  const sorted = $derived(
    sort === 'mostPlayed'
      ? [...songs].sort((a, b) => (b.playCount || 0) - (a.playCount || 0))
      : songs,
  );
  const results = $derived(searchSongs(sorted, query));
  const visible = $derived(results.slice(0, limit));
  $effect(() => {
    query;
    sort;
    const url = new URL(location.href);
    query.trim()
      ? url.searchParams.set('q', query.trim())
      : url.searchParams.delete('q');
    sort === 'recentlyAdded'
      ? url.searchParams.delete('sort')
      : url.searchParams.set('sort', sort);
    history.replaceState({}, '', url.pathname + url.search);
  });
  $effect(() => {
    const controller = new AbortController();
    loadController = controller;
    const requestedSort = sort;
    $libraryVersion;
    load(requestedSort, controller.signal);
    return () => controller.abort();
  });
  async function load(requestedSort: string, signal: AbortSignal) {
    loading = true;
    error = '';
    limit = 100;
    songs = [];
    const userId = $session?.user?.id || 'single-user';
    if (requestedSort === 'artist') {
      const cached = await readAllCachedSongs(userId).catch(() => []);
      if (!signal.aborted && cached.length) {
        songs = cached;
        loading = false;
      }
    }
    let cursor: Record<string, unknown> | null = null;
    const collected = new Map<string, Song>();
    try {
      do {
        const page = await api.songs(cursor, 100, signal, requestedSort);
        if (signal.aborted) return;
        page.songs.forEach((song) => collected.set(song.trackId, song));
        songs = [...collected.values()];
        loading = false;
        hydrating = page.hasMore;
        if (requestedSort === 'artist') {
          await upsertSongsPage(userId, cursor, page, { signal }).catch(
            () => {},
          );
          if (!signal.aborted)
            await writeSongsCacheMeta(
              userId,
              {
                complete: !page.hasMore,
                lastCursor: page.nextCursor,
              },
              { signal },
            ).catch(() => {});
        }
        cursor = page.hasMore ? page.nextCursor : null;
      } while (cursor && !signal.aborted);
    } catch (e) {
      if (!signal.aborted) error = errorMessage(e);
    } finally {
      if (!signal.aborted) {
        loading = false;
        hydrating = false;
      }
    }
  }
  function select(song: Song) {
    if ($playback.song?.trackId !== song.trackId)
      setQueue(
        results,
        results.findIndex((item) => item.trackId === song.trackId),
      );
  }
  function refreshPlays(event: Event) {
    const data = (event as CustomEvent).detail;
    songs = songs.map((song) =>
      song.trackId === data.trackId
        ? { ...song, playCount: data.playCount }
        : song,
    );
  }
  onMount(() => {
    const availabilityController = new AbortController();
    const pendingAvailability = new Set<string>();
    const availabilityAttempts = new Map<string, number>();
    const maxAvailabilityAttempts = 30;
    const availabilityTimer = setInterval(() => {
      for (const song of songs) {
        const attempts = availabilityAttempts.get(song.trackId) || 0;
        if (
          song.isAvailable ||
          pendingAvailability.has(song.trackId) ||
          attempts >= maxAvailabilityAttempts
        )
          continue;
        availabilityAttempts.set(song.trackId, attempts + 1);
        pendingAvailability.add(song.trackId);
        void api
          .song(song.trackId, availabilityController.signal)
          .then(
            (data) => {
              if (disposed || !data.song.isAvailable || !songs.includes(song))
                return;
              songs = songs.map((current) =>
                current === song ? data.song : current,
              );
              updateQueueSong(song.trackId, data.song);
            },
            () => {
              /* Retry transient failures on the next polling interval. */
            },
          )
          .finally(() => pendingAvailability.delete(song.trackId));
      }
    }, 2000);
    observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) limit += 100;
      },
      { rootMargin: '400px' },
    );
    observer.observe(boundary);
    const offDeleted = onSongDeleted((trackId) => {
      loadController?.abort();
      songs = songs.filter((song) => song.trackId !== trackId);
      if (deleting?.trackId === trackId) deleting = null;
    });
    window.addEventListener('orpheus:song-play-recorded', refreshPlays);
    return () => {
      disposed = true;
      clearInterval(availabilityTimer);
      availabilityController.abort();
      offDeleted();
      clearTimeout(artTimer);
      observer?.disconnect();
      window.removeEventListener('orpheus:song-play-recorded', refreshPlays);
    };
  });
</script>

<section class="page library-page">
  <header class="page-heading">
    <div>
      <h1>Library<span class="title-dot">.</span></h1>
      <p class="muted">
        {songs.length.toLocaleString()}
        {songs.length === 1 ? 'song' : 'songs'}
      </p>
    </div>
    <Button href="/discover"><Plus size={17} />Add songs</Button>
  </header>
  <div class="library-controls">
    <div class="library-toolbar">
      <div class="search-field">
        <Search size={18} /><Input
          id="library-search"
          type="search"
          aria-label="Search your library"
          placeholder="Search songs, artists, albums, or lyrics"
          bind:value={query}
          oninput={() => (limit = 100)}
        /><kbd>{searchShortcut}</kbd>
      </div>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger class="sort-control" aria-label="Sort songs">
          <ArrowDownUp size={15} />
          <span
            >{sortOptions.find((option) => option.value === sort)?.label ||
              'Artist A–Z'}</span
          >
          <ChevronDown size={14} />
        </DropdownMenu.Trigger>
        <DropdownMenu.Content align="end" class="library-sort-menu">
          <DropdownMenu.RadioGroup bind:value={sort}>
            {#each sortOptions as option}
              <DropdownMenu.RadioItem value={option.value} closeOnSelect
                >{option.label}</DropdownMenu.RadioItem
              >
            {/each}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    </div>
    <div class="collection-label">
      <span
        >{query
          ? `${results.length} ${results.length === 1 ? 'result' : 'results'}`
          : 'ALL SONGS'}</span
      >
      {#if hydrating}<span>Loading the rest of your library…</span>{/if}
    </div>
  </div>
  {#if error}<div class="inline-error" role="alert">
      <p>{error}</p>
      <Button
        variant="outline"
        onclick={() => libraryVersion.update((n) => n + 1)}>Try again</Button
      >
    </div>{/if}
  {#if loading}<div class="song-skeletons" aria-label="Loading songs">
      {#each Array(7) as _}<div class="song-skeleton">
          <Skeleton class="size-11 rounded-md" />
          <div>
            <Skeleton class="h-3 w-40" /><Skeleton class="mt-3 h-2 w-24" />
          </div>
        </div>{/each}
    </div>
  {:else if !results.length}<div class="empty">
      <Disc3 size={42} strokeWidth={1} />
      <h2>
        {query ? 'Nothing on this frequency.' : 'Your collection starts here.'}
      </h2>
      <p class="muted">
        {query
          ? hydrating
            ? 'Still searching the rest of your library.'
            : 'Try another song, artist, or a line you remember.'
          : 'Find a song you love and make it part of your library.'}
      </p>
      <Button
        variant="outline"
        onclick={() => (query ? (query = '') : navigate('/discover'))}
        >{query ? 'Clear search' : 'Find your first song'}</Button
      >
    </div>
  {:else}
    <div class="song-list" role="list" aria-label="Library songs">
      <div class="song-columns" aria-hidden="true">
        <span>#</span><span>SONG</span><span>ALBUM</span><span
          >{sort === 'mostPlayed' ? 'PLAYS' : 'TIME'}</span
        ><span></span>
      </div>
      {#each visible as song, index (song.trackId)}
        <div
          class="song-row"
          class:current={$playback.song?.trackId === song.trackId}
          role="listitem"
        >
          <span class="song-number"
            >{#if $playback.song?.trackId === song.trackId}<span
                class="playing-equalizer"
                class:active={$playback.status === 'playing'}
                role="img"
                aria-label={$playback.status === 'playing'
                  ? 'Playing'
                  : 'Selected song'}
                ><span></span><span></span><span></span><span></span></span
              >{:else}{String(index + 1).padStart(2, '0')}{/if}</span
          >
          <button
            class="song-main"
            onclick={() => select(song)}
            aria-label={`Play ${song.name}`}
            ><Artwork
              src={song.albumArt}
              onfailed={() => refreshArtwork(song.trackId)}
            /><span class="song-info"
              ><strong>{song.name}</strong><span
                >{song.artistName}{#if !song.isAvailable}<span
                    class="unavailable-note"
                  >
                    · Audio unavailable</span
                  >{/if}</span
              ></span
            ></button
          >
          <span class="song-album" title={song.albumName}>{song.albumName}</span
          >
          <span class="song-duration"
            >{#if !song.isAvailable}<span
                class="unavailable-dot"
                title="Audio unavailable"
                aria-label="Audio unavailable"
              ></span>{:else if sort === 'mostPlayed'}{song.playCount ||
                0}{:else}{duration(song.duration)}{/if}</span
          >
          <DropdownMenu.Root
            ><DropdownMenu.Trigger
              class="icon-control song-menu"
              aria-label={`Actions for ${song.name}`}
              ><MoreHorizontal size={20} /></DropdownMenu.Trigger
            ><DropdownMenu.Content align="end"
              ><DropdownMenu.Item onclick={() => select(song)}
                ><Play size={15} />Play song</DropdownMenu.Item
              ><DropdownMenu.Item
                onclick={() =>
                  navigate(`/songs/${encodeURIComponent(song.trackId)}/edit`)}
                ><Pencil size={15} />Edit song</DropdownMenu.Item
              ><DropdownMenu.Item
                variant="destructive"
                onclick={() => (deleting = song)}
                ><Trash2 size={15} />Delete song</DropdownMenu.Item
              >{#if !song.isAvailable}<DropdownMenu.Separator
                /><DropdownMenu.Label>Audio unavailable</DropdownMenu.Label
                ><DropdownMenu.Item
                  onclick={() =>
                    navigate(`/songs/${encodeURIComponent(song.trackId)}/edit`)}
                  >Manage audio source</DropdownMenu.Item
                >{/if}</DropdownMenu.Content
            ></DropdownMenu.Root
          >
        </div>
      {/each}
    </div>
    {#if results.length > limit}<Button
        variant="ghost"
        onclick={() => (limit += 100)}>Show more songs</Button
      >{/if}
  {/if}
  <div bind:this={boundary} class="scroll-boundary"></div>
</section>

<DeleteSongDialog song={deleting} onclose={() => (deleting = null)} />
