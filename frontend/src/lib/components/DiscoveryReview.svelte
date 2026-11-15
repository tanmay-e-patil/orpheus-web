<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import {
    ArrowLeft,
    Check,
    Library,
    LoaderCircle,
    ArrowRight,
  } from '@lucide/svelte';
  import * as Alert from '$lib/components/ui/alert';
  import { Skeleton } from '$lib/components/ui/skeleton';
  import { Button } from '$lib/components/ui/button';
  import DiscoveryMetadata from './DiscoveryMetadata.svelte';
  import DiscoveryLyrics from './DiscoveryLyrics.svelte';
  import DiscoveryAudio from './DiscoveryAudio.svelte';
  import { api } from '$lib/api';
  import { navigate } from '$lib/navigation.svelte';
  import { seconds, adjustLrc } from '$lib/music';
  import {
    rankAudioSources,
    suggestedTrack,
    manualTrack,
    trackEdits,
  } from '$lib/discovery';
  import {
    loadWorkflowState,
    saveWorkflowState,
    clearWorkflowState,
    deleteNamedDraft,
  } from '$lib/core/workflow-store.svelte';
  import {
    buildCommitItems,
    mergeCommitResults,
  } from '$lib/core/workflow-save';
  import { clearSongsCache } from '$lib/core/idb-song-cache';
  import { errorMessage, cacheUserId, library } from '$lib/state.svelte';
  import type {
    Workflow,
    Video,
    Track,
    LyricsOption,
    Match,
    SongEdits,
  } from '$lib/types';

  let { initialDraft }: { initialDraft: Workflow } = $props();
  const initial = untrack(() => structuredClone(initialDraft));
  let draft = $state<Workflow>(initial);
  let lyricsBusy = $state(false);
  let saving = $state(false);
  let lyricsController: AbortController | undefined;
  let busy = $state(false),
    activity = $state(''),
    error = $state('');
  let sourceQuery = $state(initial.searchQuery),
    metadataQuery = $state(initial.searchQuery),
    lyricsQuery = $state(initial.searchQuery);
  let previewing = $state(false);
  let previewContainer = $state<HTMLElement>();
  let audioChoices = $state(false),
    metadataChoices = $state(false),
    lyricsChoices = $state(false);
  let controller = new AbortController(),
    disposed = false;
  const selected = $derived(
    draft.selectedVideos.find((video) => video.selected),
  );
  const match = $derived(draft.trackMatches[0]);
  const track = $derived(match?.selectedMatch);
  const edit = $derived(draft.editedTracks[0]);
  const lyricsResult = $derived(
    draft.lyricsSearchResults.find((row) => row.trackId === track?.id),
  );
  const notices = $derived(draft.reviewNotices || {});
  const saved = $derived(
    !!track &&
      (draft.saveResults || []).some(
        (row) => row.trackId === track.id && row.success,
      ),
  );
  const locked = $derived(busy || saved);

  function active() {
    return !disposed && loadWorkflowState()?.id === draft.id;
  }
  function persist() {
    if (active()) saveWorkflowState($state.snapshot(draft));
  }
  function updateEdit(key: keyof SongEdits, value: string) {
    if (!edit || locked) return;
    edit[key] = value;
    if (['trackName', 'artistName', 'albumName'].includes(key) && lyricsBusy) {
      lyricsController?.abort();
      lyricsBusy = false;
      notice(
        'lyrics',
        'Song info edited. Search lyrics again to match your changes.',
      );
    }
    if (key === 'lyrics' || key === 'syncedLyrics')
      draft.lyricsManuallyEdited = true;
    persist();
  }
  function notice(section: 'audio' | 'metadata' | 'lyrics', message = '') {
    draft.reviewNotices = { ...draft.reviewNotices, [section]: message };
    persist();
  }
  async function run(action: () => Promise<void>) {
    if (locked) return;
    busy = true;
    error = '';
    try {
      await action();
    } catch (e) {
      if (active() && !controller.signal.aborted) error = errorMessage(e);
    } finally {
      if (!disposed) {
        busy = false;
        activity = '';
        persist();
      }
    }
  }
  function applyTrack(next: Track, result?: Match, replace = true) {
    if (!selected) return;
    const previous = edit;
    const defaults = track ? trackEdits(track, selected) : undefined;
    const updated = trackEdits(next, selected);
    if (previous) {
      updated.lyrics = previous.lyrics;
      updated.syncedLyrics = previous.syncedLyrics;
      if (!replace && defaults) {
        for (const key of [
          'trackName',
          'artistName',
          'albumName',
          'albumArt',
          'releaseDate',
        ] as const) {
          if (previous[key] !== defaults[key]) updated[key] = previous[key];
        }
      }
    }
    draft.trackMatches = [
      {
        ...(result || match || { trackMatches: [] }),
        youtubeVideo: selected,
        selectedMatch: next,
      },
    ];
    draft.trackMatchSearchQuery = draft.searchQuery;
    draft.editedTracks = [updated];
    notice(
      'metadata',
      next.id.startsWith('youtube:')
        ? 'Song info wasn’t found. Enter the title and artist below, or search for another match.'
        : result?.autoAccept
          ? ''
          : 'Possible match. Check the title, artist, and recording.',
    );
    persist();
  }
  async function fetchMatch(
    video: Video,
    query = draft.searchQuery,
  ): Promise<Match> {
    const rows = await api.matchDeezerTracks([video], query, controller.signal);
    return rows[0] || { youtubeVideo: video, trackMatches: [] };
  }
  async function fetchLyrics(custom = false) {
    if (!selected || !track) return;
    lyricsController?.abort();
    const requestController = new AbortController();
    lyricsController = requestController;
    lyricsBusy = true;
    const sourceID = selected.id;
    const currentTrack = {
      ...track,
      name: edit?.trackName || track.name,
      artist: edit?.artistName || track.artist,
      album: edit?.albumName || track.album,
    };
    const sourceSeconds = seconds(selected.duration);
    const payload = sourceSeconds
      ? { ...currentTrack, durationMs: sourceSeconds * 1000 }
      : currentTrack;
    try {
      const result = custom
        ? await api.customLyricsSearch(
            payload,
            lyricsQuery,
            requestController.signal,
          )
        : await api.lyricsOptions(payload, requestController.signal);
      if (
        !active() ||
        requestController.signal.aborted ||
        selected?.id !== sourceID ||
        track?.id !== currentTrack.id
      )
        return;
      draft.lyricsSearchResults = [result];
      const option =
        result.selectedOption ||
        result.options.find((row) => (row.confidence || 0) >= 90);
      if (
        option &&
        edit &&
        !draft.lyricsManuallyEdited &&
        !edit.lyrics &&
        !edit.syncedLyrics
      ) {
        result.selectedOption = option;
        edit.lyrics = option.plainLyrics || '';
        edit.syncedLyrics = option.syncedLyrics || '';
      }
      notice(
        'lyrics',
        !result.options.length
          ? 'No lyrics found.'
          : !result.autoAccept
            ? 'Possible match. Check the lyrics and their timing.'
            : '',
      );
    } catch (e) {
      if (!active() || requestController.signal.aborted) return;
      notice('lyrics', 'Lyrics couldn’t be loaded. Retry, or add your own.');
    } finally {
      if (lyricsController === requestController) lyricsBusy = false;
    }
    persist();
  }
  async function prepare() {
    activity = 'Finding an audio source…';
    if (!draft.selectedVideos.length) {
      const videos = await api.discoverYouTube(
        draft.searchQuery,
        controller.signal,
      );
      if (!active()) return;
      draft.selectedVideos = rankAudioSources(videos, draft.searchQuery);
      persist();
    }
    if (!draft.selectedVideos.length) {
      notice(
        'audio',
        'No audio sources found. Try another title or artist below.',
      );
      draft.reviewPrepared = true;
      return;
    }
    if (!track) {
      let chosenVideo = selected || draft.selectedVideos[0];
      let chosenMatch: Match | undefined;
      let lookupFailed = false;
      activity = 'Matching the song…';
      for (const video of selected
        ? [selected]
        : draft.selectedVideos.slice(0, 3)) {
        try {
          const result = await fetchMatch(video);
          if (!active()) return;
          if (
            !chosenMatch ||
            (suggestedTrack(result)?.matchScore || 0) >
              (suggestedTrack(chosenMatch)?.matchScore || 0)
          ) {
            chosenVideo = video;
            chosenMatch = result;
          }
          if (result.autoAccept) {
            chosenVideo = video;
            chosenMatch = result;
            break;
          }
        } catch {
          if (!active()) return;
          lookupFailed = true;
        }
      }
      draft.selectedVideos = draft.selectedVideos.map((video) => ({
        ...video,
        selected: video.id === chosenVideo.id,
      }));
      const suggestion = chosenMatch && suggestedTrack(chosenMatch);
      applyTrack(suggestion || manualTrack(chosenVideo), chosenMatch, false);
      if (!chosenMatch && lookupFailed)
        notice(
          'metadata',
          'Song info is temporarily unavailable. Fill it in below or retry the lookup.',
        );
      if (!chosenMatch?.autoAccept)
        notice('audio', 'Possible match. Play it to check the recording.');
    }
    if (!active()) return;
    if (active()) {
      draft.reviewPrepared = true;
      persist();
    }
    if (
      !draft.lyricsSearchResults.length &&
      track &&
      !track.id.startsWith('youtube:')
    )
      void fetchLyrics();
  }
  async function searchSources() {
    await run(async () => {
      activity = 'Finding other audio sources…';
      const videos = await api.discoverYouTube(sourceQuery, controller.signal);
      if (!active()) return;
      const current = selected;
      draft.selectedVideos = rankAudioSources(videos, sourceQuery).map(
        (video) => ({ ...video, selected: video.id === current?.id }),
      );
      if (
        current &&
        !draft.selectedVideos.some((video) => video.id === current.id)
      )
        draft.selectedVideos.unshift(current);
      if (!current && videos.length) {
        draft.selectedVideos = rankAudioSources(videos, sourceQuery);
        await prepare();
      }
      notice(
        'audio',
        videos.length
          ? ''
          : 'No other audio sources found. Try a different search.',
      );
    });
  }
  function useSource(video: Video) {
    if (locked) return;
    lyricsController?.abort();
    lyricsBusy = false;
    draft.selectedVideos = draft.selectedVideos.map((row) => ({
      ...row,
      selected: row.id === video.id,
    }));
    if (track && edit) {
      draft.trackMatches[0].youtubeVideo = { ...video, selected: true };
      edit.trackDuration = video.duration || '';
    }
    previewing = false;
    audioChoices = false;
    notice(
      'audio',
      'Audio changed. Preview this recording and recheck any synced lyrics.',
    );
    persist();
  }
  async function searchMetadata() {
    if (!selected) return;
    await run(async () => {
      activity = 'Finding song info…';
      const result = await api.customDeezerMatch(selected!, metadataQuery);
      if (!active()) return;
      draft.trackMatches[0].trackMatches = result.trackMatches;
      if (track?.id.startsWith('youtube:')) {
        const suggestion = suggestedTrack(result);
        if (suggestion) {
          applyTrack(suggestion, result, false);
          await fetchLyrics();
        }
      }
      notice(
        'metadata',
        result.trackMatches.length
          ? 'Choose a result below to replace the song info.'
          : 'No matching song info found. You can enter it yourself.',
      );
    });
  }
  function useTrack(next: Track) {
    if (locked) return;
    lyricsController?.abort();
    lyricsBusy = false;
    applyTrack(next);
    metadataChoices = false;
    draft.lyricsSearchResults = [];
    notice('lyrics', 'Song info changed. Check your lyrics or search again.');
  }
  function useLyrics(option?: LyricsOption) {
    if (locked || !edit) return;
    draft.lyricsManuallyEdited = true;
    if (lyricsResult) lyricsResult.selectedOption = option;
    edit.lyrics = option?.plainLyrics || '';
    edit.syncedLyrics = option?.syncedLyrics || '';
    notice('lyrics', '');
    lyricsChoices = false;
    persist();
  }
  function shiftTiming(offset: number) {
    if (!edit || locked) return;
    draft.lyricsManuallyEdited = true;
    edit.syncedLyrics = adjustLrc(edit.syncedLyrics, offset);
    persist();
  }
  async function preview() {
    previewing = true;
    await tick();
    previewContainer?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  async function save(event: SubmitEvent) {
    event.preventDefault();
    if (locked || !track || !selected) return;
    // Keep the visible review consistent with the payload submitted now.
    lyricsController?.abort();
    lyricsBusy = false;
    saving = true;
    await run(async () => {
      const submitted = buildCommitItems(draft, draft.saveResults || []).map(
        (item) => ({ ...item, lyricsSearchResult: undefined }),
      );
      const result = await api.commit(submitted);
      if (disposed) return;
      draft.saveResults = mergeCommitResults(
        draft.saveResults || [],
        submitted,
        result.results || [],
      );
      if (active()) {
        if (draft.saveResults.every((row) => row.success)) {
          clearWorkflowState();
          deleteNamedDraft(draft.id);
        } else persist();
      }
      await clearSongsCache(cacheUserId()).catch(() => {});
      library.version++;
      if (
        !disposed &&
        buildCommitItems(draft, draft.saveResults).length === 0
      ) {
        navigate('/home?sort=recentlyAdded');
      }
    }).finally(() => {
      saving = false;
    });
  }
  onMount(() => {
    if (!draft.reviewPrepared && !saved) run(prepare);
    return () => {
      disposed = true;
      controller.abort();
      lyricsController?.abort();
    };
  });
</script>

<section class="page discovery-review">
  <div class="workflow-top">
    <a class="back-link" href="/discover"><ArrowLeft size={15} />New search</a
    >{#if !saved}<span class="small muted">Draft saved automatically</span>{/if}
  </div>
  <header class="page-heading compact">
    <div>
      <h1>{saved ? 'Song added' : 'Review your song'}</h1>
      {#if !saved}<p class="muted">Picked for “{draft.searchQuery}”</p>{/if}
    </div>
  </header>
  {#if busy}<div class="review-progress" role="status">
      <Skeleton class="h-3 w-3 rounded-full" aria-hidden="true" />{activity ||
        'Saving your song…'}
    </div>{/if}
  {#if error}<Alert.Root variant="destructive" class="mb-5"
      ><Alert.Title>Could not complete your request</Alert.Title
      ><Alert.Description>{error}</Alert.Description>
      {#if !selected}<Button
          variant="outline"
          disabled={busy}
          onclick={() => run(prepare)}>Try again</Button
        >{/if}
    </Alert.Root>{/if}
  <div class="discovery-review-grid">
    <div class="review-main">
      <DiscoveryMetadata
        {track}
        {edit}
        {selected}
        {busy}
        {locked}
        notice={notices.metadata}
        bind:choices={metadataChoices}
        bind:query={metadataQuery}
        candidates={match?.trackMatches || []}
        onedit={updateEdit}
        onsave={save}
        onsearch={searchMetadata}
        onselect={useTrack}
      />
      <DiscoveryLyrics
        {edit}
        result={lyricsResult}
        {busy}
        {lyricsBusy}
        {locked}
        notice={notices.lyrics}
        bind:choices={lyricsChoices}
        bind:query={lyricsQuery}
        onedit={updateEdit}
        onsearch={() => fetchLyrics(true)}
        onretry={() => fetchLyrics()}
        onselect={useLyrics}
      />
    </div>
    <DiscoveryAudio
      {selected}
      videos={draft.selectedVideos}
      {locked}
      notice={notices.audio}
      syncedLyrics={edit?.syncedLyrics || ''}
      plainLyrics={edit?.lyrics || ''}
      bind:query={sourceQuery}
      bind:choices={audioChoices}
      bind:previewing
      bind:container={previewContainer}
      onsearch={searchSources}
      onselect={useSource}
      onshift={shiftTiming}
      onpreview={() => preview()}
    />
  </div>
  {#each draft.saveResults || [] as result}{#if !result.success}<Alert.Root
        variant="destructive"
        class="mt-4"
        ><Alert.Description
          >{result.error ||
            'Could not save this song. Please retry.'}</Alert.Description
        ></Alert.Root
      >{/if}{/each}
  <footer class="review-save-actions" aria-label="Save song">
    {#if saved}
      <div class="review-save-confirmation" role="status">
        <Check size={18} />
        <div>
          <strong>Saved to your library</strong>
          <p class="small muted">Audio may still be processing.</p>
        </div>
      </div>
      <Button
        href="/home?sort=recentlyAdded"
        variant="outline"
        class="review-save-button"
        >Go to your library<ArrowRight size={16} /></Button
      >
    {:else}
      <Button
        type="submit"
        form="song-review-form"
        class="review-save-button"
        disabled={locked || !track || !selected}
        aria-busy={saving}
      >
        {#if saving}<LoaderCircle
            size={17}
            class="animate-spin motion-reduce:animate-none"
          />{:else}<Library size={17} />{/if}
        {saving
          ? 'Saving…'
          : draft.saveResults?.length
            ? 'Retry save'
            : 'Save to library'}
      </Button>
    {/if}
  </footer>
</section>
