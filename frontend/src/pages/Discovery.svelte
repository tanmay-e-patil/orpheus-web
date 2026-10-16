<script lang="ts">
  import { onMount } from 'svelte';
  import {
    Search,
    ArrowRight,
    ArrowLeft,
    Check,
    Play,
    RotateCcw,
    Trash2,
    Bookmark,
    Plus,
    Music2,
  } from '@lucide/svelte';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Textarea } from '$lib/components/ui/textarea';
  import Artwork from '$lib/components/Artwork.svelte';
  import VideoPreview from '$lib/components/VideoPreview.svelte';
  import { api } from '$lib/api';
  import { navigate } from '$lib/navigation';
  import { notify, errorMessage, session, libraryVersion } from '$lib/state';
  import {
    createInitialWorkflowState,
    loadWorkflowState,
    saveWorkflowState,
    clearWorkflowState,
    getAllDrafts,
    saveNamedDraft,
    deleteNamedDraft,
    stageRoutes,
  } from '$lib/core/store.js';
  import { clearSongsCache } from '$lib/core/idb-song-cache.js';
  import {
    buildCommitItems,
    mergeCommitResults,
  } from '$lib/core/workflow-save.js';
  import { duration, matchesSelection, makeEdits } from '$lib/music';
  import type {
    Workflow,
    Video,
    LyricsResult,
    Track,
    SongEdits,
    SaveResult,
  } from '$lib/types';
  let { stage }: { stage: string } = $props();
  const initialDraft = (loadWorkflowState() ||
    createInitialWorkflowState('')) as Workflow;
  let draft = $state<Workflow>(initialDraft);
  let query = $state(''),
    customQuery = $state(initialDraft.searchQuery);
  let busy = $state(false),
    error = $state(''),
    preview = $state<Video | null>(null),
    previewLyrics = $state('');
  let drafts = $state(Object.entries(getAllDrafts()) as [string, Workflow][]);
  let activeSession = $state(loadWorkflowState() as Workflow | null);
  let undo = $state<{ message: string; restore: () => void } | null>(null);
  let saveResults = $state<SaveResult[]>(initialDraft.saveResults || []);
  let controller = new AbortController(),
    disposed = false;
  const steps = [
    { key: 'youtube', label: 'Audio source' },
    { key: 'spotify', label: 'Song info' },
    { key: 'lyrics', label: 'Lyrics' },
    { key: 'review', label: 'Review & save' },
  ];
  const stepIndex = $derived(steps.findIndex((step) => step.key === stage));
  const selected = $derived(
    draft.selectedVideos.find((video) => video.selected),
  );
  const matches = $derived(
    draft.trackMatches.filter((match) => match.selectedMatch),
  );
  const allSaved = $derived(
    stage === 'review' &&
      matches.length > 0 &&
      buildCommitItems(draft, saveResults).length === 0,
  );
  const locked = $derived(busy || saveResults.some((result) => result.success));
  const editFields: {
    key: keyof SongEdits;
    label: string;
    required?: boolean;
  }[] = [
    { key: 'trackName', label: 'Song title', required: true },
    { key: 'artistName', label: 'Artist', required: true },
    { key: 'albumName', label: 'Album', required: true },
    { key: 'albumArt', label: 'Artwork URL' },
    { key: 'releaseDate', label: 'Release date' },
    { key: 'trackDuration', label: 'Duration' },
  ];
  function preserveCurrent() {
    const current = loadWorkflowState();
    if (current) saveNamedDraft(current.id, current);
  }
  function persist() {
    if (!disposed && loadWorkflowState()?.id === draft.id)
      saveWorkflowState($state.snapshot(draft));
  }
  function advance(next: string) {
    draft.currentStage = next;
    persist();
    navigate(`/discover/${next}`);
  }
  async function run(action: () => Promise<void>) {
    if (busy) return;
    busy = true;
    error = '';
    try {
      await action();
    } catch (e) {
      if (!controller.signal.aborted) error = errorMessage(e);
    } finally {
      if (!disposed) busy = false;
    }
  }
  async function start(event: SubmitEvent) {
    event.preventDefault();
    if (!query.trim()) return;
    preserveCurrent();
    draft = createInitialWorkflowState(query.trim()) as Workflow;
    saveWorkflowState(draft);
    navigate(`/discover/youtube?q=${encodeURIComponent(query.trim())}`);
  }
  async function searchVideos(event?: SubmitEvent) {
    event?.preventDefault();
    if (!query.trim()) return;
    await run(async () => {
      const videos = await api.discoverYouTube(query.trim(), controller.signal);
      if (disposed) return;
      draft.searchQuery = query.trim();
      draft.selectedVideos = videos;
      draft.trackMatches = [];
      draft.lyricsSearchResults = [];
      draft.editedTracks = [];
      draft.saveResults = [];
      persist();
    });
  }
  function selectVideo(id: string) {
    draft.selectedVideos = draft.selectedVideos.map((video) => ({
      ...video,
      selected: video.id === id,
    }));
    draft.trackMatches = [];
    draft.lyricsSearchResults = [];
    draft.editedTracks = [];
    draft.saveResults = [];
    persist();
  }
  async function matchTracks(custom = false) {
    if (!selected) {
      error = 'Choose an audio source first.';
      return;
    }
    await run(async () => {
      const results = custom
        ? [await api.customDeezerMatch(selected, customQuery)]
        : await api.matchDeezerTracks(
            [selected],
            draft.searchQuery,
            controller.signal,
          );
      if (disposed) return;
      draft.trackMatches = results;
      draft.trackMatchSearchQuery = draft.searchQuery;
      draft.editedTracks = [];
      draft.lyricsSearchResults = [];
      persist();
    });
  }
  function selectTrack(index: number, track: Track) {
    draft.trackMatches[index].selectedMatch = track;
    draft.editedTracks = [];
    draft.lyricsSearchResults = [];
    draft.saveResults = [];
    persist();
  }
  async function findLyrics(index?: number) {
    await run(async () => {
      if (index !== undefined) {
        const track = matches[index].selectedMatch!;
        const result = await api.customLyricsSearch(track, customQuery);
        if (!disposed) {
          draft.lyricsSearchResults = draft.lyricsSearchResults
            .filter((row) => row.trackId !== track.id)
            .concat(result);
          persist();
        }
      } else {
        for (const match of matches) {
          const result = await api.lyricsOptions(
            match.selectedMatch!,
            controller.signal,
          );
          if (disposed) return;
          draft.lyricsSearchResults = draft.lyricsSearchResults
            .filter((row) => row.trackId !== result.trackId)
            .concat(result);
          persist();
        }
      }
    });
  }
  function chooseLyrics(
    result: LyricsResult,
    option?: LyricsResult['selectedOption'],
  ) {
    result.selectedOption = option;
    draft.editedTracks = draft.editedTracks.map((edit, index) =>
      matches[index]?.selectedMatch?.id === result.trackId
        ? {
            ...edit,
            lyrics: option?.plainLyrics || '',
            syncedLyrics: option?.syncedLyrics || '',
          }
        : edit,
    );
    persist();
  }
  async function save(event: SubmitEvent) {
    event.preventDefault();
    if (busy || allSaved) return;
    await run(async () => {
      persist();
      const submitted = buildCommitItems(draft, saveResults);
      const response = await api.commit(submitted);
      saveResults = mergeCommitResults(
        saveResults,
        submitted,
        response.results || [],
      );
      draft.saveResults = saveResults;
      if (loadWorkflowState()?.id === draft.id) {
        if (buildCommitItems(draft, saveResults).length === 0) {
          clearWorkflowState();
          deleteNamedDraft(draft.id);
        } else saveWorkflowState($state.snapshot(draft));
      }
      await clearSongsCache($session?.user?.id || 'single-user').catch(
        () => {},
      );
      libraryVersion.update((n) => n + 1);
    });
  }
  function reloadDrafts() {
    drafts = Object.entries(getAllDrafts()) as [string, Workflow][];
    activeSession = loadWorkflowState();
  }
  function discard() {
    const previous = activeSession;
    if (!previous) return;
    clearWorkflowState();
    undo = {
      message: 'Session discarded.',
      restore: () => {
        preserveCurrent();
        saveWorkflowState(previous);
        reloadDrafts();
      },
    };
    reloadDrafts();
  }
  function deleteDraft(name: string, draft: Workflow) {
    deleteNamedDraft(name);
    undo = {
      message: 'Draft deleted.',
      restore: () => {
        saveNamedDraft(name, draft);
        reloadDrafts();
      },
    };
    reloadDrafts();
  }
  onMount(() => {
    query = stage === 'search' ? '' : initialDraft.searchQuery;
    if (stage === 'search') return;
    if (!loadWorkflowState()) {
      navigate('/discover', true);
      return;
    }
    if (stage === 'commit') {
      navigate('/discover/review', true);
      return;
    }
    if (stepIndex < 0) {
      navigate('/discover', true);
      return;
    }
    draft.currentStage = stage;
    persist();
    if (stage === 'youtube' && !draft.selectedVideos.length && query)
      searchVideos();
    if (stage === 'spotify' && !matchesSelection(draft)) matchTracks();
    if (
      stage === 'lyrics' &&
      matches.some(
        (match) =>
          !draft.lyricsSearchResults.some(
            (result) => result.trackId === match.selectedMatch?.id,
          ),
      )
    )
      findLyrics();
    if (stage === 'review') {
      draft.editedTracks = makeEdits(draft);
      persist();
    }
    return () => {
      disposed = true;
      controller.abort();
    };
  });
</script>

<section class="page discovery-page">
  {#if stage === 'search'}
    <header class="page-heading">
      <div>
        <p class="eyebrow">MAKE A NEW DISCOVERY</p>
        <h1>Find your next keep<span class="title-dot">.</span></h1>
        <p class="muted">From a song you love to a song in your library.</p>
      </div>
    </header>
    <form class="discovery-search" onsubmit={start}>
      <label for="discovery-query">What have you been listening to?</label>
      <div class="search-field">
        <Search size={20} /><Input
          id="discovery-query"
          type="search"
          placeholder="A song, an artist, a little inspiration…"
          bind:value={query}
          required
        />
      </div>
      <Button type="submit">Find songs<ArrowRight size={17} /></Button>
    </form>
    <div class="discovery-explainer">
      <span><span>01</span>Find the audio</span><span
        ><span>02</span>Choose song info</span
      ><span><span>03</span>Make it yours</span>
    </div>
    {#if undo}<div class="undo-banner" role="status">
        <span>{undo.message}</span><Button
          variant="ghost"
          onclick={() => {
            undo?.restore();
            undo = null;
          }}>Undo</Button
        >
      </div>{/if}
    {#if activeSession}<section class="draft-section">
        <p class="eyebrow">PICK UP WHERE YOU LEFT OFF</p>
        <div class="draft-card">
          <Bookmark size={23} />
          <div>
            <strong>{activeSession.searchQuery}</strong>
            <p class="muted">
              {steps.find((step) => step.key === activeSession?.currentStage)
                ?.label || 'Review & save'} · Saved automatically
            </p>
          </div>
          <div class="actions">
            <Button variant="ghost" onclick={discard}>Discard session</Button
            ><Button
              variant="outline"
              href={stageRoutes[
                activeSession.currentStage as keyof typeof stageRoutes
              ] || '/discover/youtube'}>Resume<ArrowRight size={15} /></Button
            >
          </div>
        </div>
      </section>{/if}
    {#if drafts.length}<section class="draft-section">
        <p class="eyebrow">SAVED FOR LATER</p>
        {#each drafts as [name, draft]}<div class="draft-card">
            <Music2 size={20} />
            <div>
              <strong>{name === draft.id ? draft.searchQuery : name}</strong>
              <p class="muted">
                {new Date(draft.timestamp).toLocaleDateString()} · {steps.find(
                  (step) => step.key === draft.currentStage,
                )?.label || 'Review & save'}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Delete draft ${draft.searchQuery}`}
              onclick={() => deleteDraft(name, draft)}
              ><Trash2 size={16} /></Button
            ><Button
              variant="outline"
              onclick={() => {
                preserveCurrent();
                saveWorkflowState(draft);
                navigate(
                  stageRoutes[draft.currentStage as keyof typeof stageRoutes] ||
                    '/discover/youtube',
                );
              }}>Resume</Button
            >
          </div>{/each}
      </section>{/if}
  {:else}
    <div class="workflow-top">
      <a href="/discover" class="back-link"><ArrowLeft size={15} />Add songs</a
      ><span class="small muted">Draft saved automatically</span>
    </div>
    <ol class="workflow-steps" aria-label="Add-song progress">
      {#each steps as step, index}<li
          class:active={index === stepIndex}
          class:done={index < stepIndex}
        >
          <button
            onclick={() => advance(step.key)}
            disabled={index >= stepIndex || locked}
            aria-current={index === stepIndex ? 'step' : undefined}
            ><span
              >{#if index < stepIndex}<Check size={13} />{:else}{index +
                  1}{/if}</span
            ><strong>{step.label}</strong></button
          >
        </li>{/each}
    </ol>
    <header class="page-heading compact">
      <div>
        <p class="eyebrow">STEP {stepIndex + 1} OF 4</p>
        <h1>
          {stage === 'youtube'
            ? 'Start with the sound.'
            : stage === 'spotify'
              ? 'Give it a name.'
              : stage === 'lyrics'
                ? 'Find the words.'
                : 'Make it part of your collection.'}
        </h1>
        <p class="muted">
          {stage === 'youtube'
            ? 'Choose the audio source that sounds right to you.'
            : stage === 'spotify'
              ? 'Pick the song information that fits your selection.'
              : stage === 'lyrics'
                ? 'Choose lyrics, or continue without them.'
                : 'One last look before you save.'}
        </p>
      </div>
    </header>
    {#if error}<div class="inline-error" role="alert">
        <p>{error}</p>
        {#if stage !== 'review'}<Button
            variant="outline"
            onclick={() =>
              stage === 'youtube'
                ? searchVideos()
                : stage === 'spotify'
                  ? matchTracks()
                  : findLyrics()}>Try again</Button
          >{/if}
      </div>{/if}
    {#if stage === 'youtube'}
      <form class="inline-search" onsubmit={searchVideos}>
        <Input
          aria-label="Search audio sources"
          bind:value={query}
          required
        /><Button type="submit" disabled={busy}
          ><Search size={16} />{busy ? 'Searching…' : 'Search'}</Button
        >
      </form>
      {#if !busy && !draft.selectedVideos.length}<div class="empty">
          <Search size={32} />
          <h2>No audio sources found</h2>
          <p class="muted">Try a different song title or artist.</p>
        </div>{/if}
      <div class="video-grid">
        {#each draft.selectedVideos as video (video.id)}<article
            class="video-card"
            class:selected={video.selected}
          >
            <div class="video-thumbnail">
              {#if video.thumbnail}<img
                  src={video.thumbnail}
                  alt=""
                  loading="lazy"
                />{:else}<Music2 size={32} />{/if}<button
                class="preview-play"
                aria-label={`Preview ${video.title}`}
                onclick={() => {
                  preview = video;
                  previewLyrics = '';
                }}><Play size={19} fill="currentColor" /></button
              ><span>{duration(video.duration)}</span>
            </div>
            <button
              class="video-select"
              aria-pressed={!!video.selected}
              onclick={() => selectVideo(video.id)}
              ><strong>{video.title}</strong><span class="muted"
                >{video.channelTitle}</span
              ><span class="selection-caption"
                >{#if video.selected}<Check size={15} />Selected audio source{:else}<Plus
                    size={15}
                  />Use this audio source{/if}</span
              ></button
            >
          </article>{/each}
      </div>
      <div class="workflow-footer">
        <Button variant="ghost" href="/discover"
          ><ArrowLeft size={16} />Back</Button
        ><span class="small muted"
          >{selected
            ? '1 audio source selected'
            : 'Choose an audio source to continue'}</span
        ><Button disabled={!selected || busy} onclick={() => advance('spotify')}
          >Choose song info<ArrowRight size={16} /></Button
        >
      </div>
    {:else if stage === 'spotify'}
      {#if selected}<div class="source-summary">
          <Artwork src={selected.thumbnail} />
          <div>
            <span class="eyebrow">SELECTED AUDIO SOURCE</span><strong
              >{selected.title}</strong
            ><span class="muted"
              >{selected.channelTitle} · {duration(selected.duration)}</span
            >
          </div>
        </div>{/if}
      <form
        class="inline-search"
        onsubmit={(e) => {
          e.preventDefault();
          matchTracks(true);
        }}
      >
        <Input
          aria-label="Search song information"
          bind:value={customQuery}
          required
        /><Button variant="outline" type="submit" disabled={busy}
          >Search song info</Button
        >
      </form>
      {#each draft.trackMatches as match, index}<div class="choice-list">
          {#each match.trackMatches as track (track.id)}<button
              class="choice-row"
              class:selected={match.selectedMatch?.id === track.id}
              onclick={() => selectTrack(index, track)}
              aria-pressed={match.selectedMatch?.id === track.id}
              ><Artwork src={track.albumImageUrl} /><span
                ><strong>{track.name}</strong><span class="muted"
                  >{track.artist} · {track.album}</span
                ><small
                  >{track.releaseDate}{track.matchScore
                    ? ` · ${track.matchScore}% match`
                    : ''}</small
                ></span
              ><span class="choice-radio"
                >{#if match.selectedMatch?.id === track.id}<Check
                    size={14}
                  />{/if}</span
              ></button
            >{/each}{#if !match.trackMatches.length}<p class="quiet-empty">
              No matching song information. Try a different search.
            </p>{/if}
        </div>{/each}
      <div class="workflow-footer">
        <Button
          variant="ghost"
          disabled={busy}
          onclick={() => advance('youtube')}><ArrowLeft size={16} />Back</Button
        ><Button
          disabled={!matches.length || busy}
          onclick={() => advance('lyrics')}
          >Find lyrics<ArrowRight size={16} /></Button
        >
      </div>
    {:else if stage === 'lyrics'}
      {#each matches as match, index}{@const result =
          draft.lyricsSearchResults.find(
            (row) => row.trackId === match.selectedMatch?.id,
          )}
        <section class="lyrics-options">
          <h2>{match.selectedMatch?.name}</h2>
          <form
            class="inline-search"
            onsubmit={(e) => {
              e.preventDefault();
              findLyrics(index);
            }}
          >
            <Input
              aria-label="Custom lyrics search"
              bind:value={customQuery}
              required
            /><Button variant="outline" type="submit" disabled={busy}
              >Search lyrics</Button
            >
          </form>
          {#if result}<div class="choice-list">
              {#each result.options as option}<article
                  class="lyrics-choice"
                  class:selected={result.selectedOption?.id === option.id}
                >
                  <button
                    class="choice-row"
                    onclick={() => chooseLyrics(result, option)}
                    aria-pressed={result.selectedOption?.id === option.id}
                    ><span
                      ><strong>{option.trackName} · {option.artistName}</strong
                      ><span class="muted"
                        >{option.albumName} · {option.syncedLyrics
                          ? 'Synced lyrics'
                          : 'Lyrics'}</span
                      ></span
                    ><span class="choice-radio"
                      >{#if result.selectedOption?.id === option.id}<Check
                          size={14}
                        />{/if}</span
                    ></button
                  >
                  <pre>{(option.plainLyrics || option.syncedLyrics || '')
                      .split('\n')
                      .slice(0, 4)
                      .join('\n')}</pre>
                  {#if option.syncedLyrics}<Button
                      variant="ghost"
                      size="sm"
                      onclick={() => {
                        preview = match.youtubeVideo;
                        previewLyrics = option.syncedLyrics || '';
                      }}><Play size={14} />Test lyrics timing</Button
                    >{/if}
                </article>{/each}{#if !result.options.length}<p
                  class="quiet-empty"
                >
                  No lyrics found. You can add them later.
                </p>{/if}
            </div>
            <Button
              variant="ghost"
              onclick={() => {
                chooseLyrics(result);
                if (matches.length === 1) advance('review');
              }}
              >{matches.length === 1
                ? 'Continue without lyrics'
                : 'Skip lyrics for this song'}</Button
            >{/if}
        </section>{/each}
      <div class="workflow-footer">
        <Button
          variant="ghost"
          disabled={busy}
          onclick={() => advance('spotify')}><ArrowLeft size={16} />Back</Button
        ><Button
          disabled={busy || !matches.length}
          onclick={() => advance('review')}
          >Review song<ArrowRight size={16} /></Button
        >
      </div>
    {:else if stage === 'review'}
      <form onsubmit={save} class="review-form">
        {#each draft.editedTracks as edit, index}{@const saved =
            saveResults.some(
              (result) =>
                result.trackId === matches[index]?.selectedMatch?.id &&
                result.success,
            )}
          <fieldset disabled={busy || saved} class="review-card">
            <legend class="sr-only">Song {index + 1}</legend>
            <div class="review-heading">
              <Artwork src={edit.albumArt} />
              <div>
                <h2>{edit.trackName || 'Untitled song'}</h2>
                <p class="muted">{edit.artistName}</p>
              </div>
              {#if saved}<span class="success-label"
                  ><Check size={15} />Saved</span
                >{/if}
            </div>
            <div class="form-grid">
              {#each editFields as field}<label
                  >{field.label}<Input
                    bind:value={edit[field.key]}
                    required={field.required}
                    pattern={field.key === 'releaseDate'
                      ? '[0-9]{4}-[0-9]{2}-[0-9]{2}'
                      : undefined}
                    placeholder={field.key === 'releaseDate'
                      ? 'YYYY-MM-DD'
                      : ''}
                    oninput={() => queueMicrotask(persist)}
                  /></label
                >{/each}
            </div>
            <details class="advanced-lyrics">
              <summary>Lyrics & synced lyrics</summary><label
                >Lyrics<Textarea
                  bind:value={edit.lyrics}
                  oninput={() => queueMicrotask(persist)}
                /></label
              ><label
                >Synced lyrics<Textarea
                  bind:value={edit.syncedLyrics}
                  oninput={() => queueMicrotask(persist)}
                /></label
              >
            </details>
          </fieldset>{/each}
        <div class="save-results" aria-live="polite">
          {#each saveResults as result}<p
              class:success={result.success}
              class:error-message={!result.success}
            >
              {result.success
                ? 'Saved to your library. Audio may still be processing.'
                : result.error || 'Could not save this song. Please retry.'}
            </p>{/each}
        </div>
        {#if !matches.length}<div class="empty">
            <h2>No songs ready to save</h2>
            <Button href="/discover/spotify">Choose song information</Button>
          </div>{/if}
        <div class="workflow-footer">
          <Button
            variant="ghost"
            disabled={locked}
            onclick={() => advance('lyrics')}
            ><ArrowLeft size={16} />Back</Button
          >{#if allSaved}<Button href="/home"
              >Go to your library<ArrowRight size={16} /></Button
            >{:else}<Button type="submit" disabled={busy || !matches.length}
              >{busy
                ? 'Saving…'
                : saveResults.length
                  ? 'Retry unsaved songs'
                  : 'Save to library'}<Check size={16} /></Button
            >{/if}
        </div>
      </form>
    {/if}
    {#if busy && stage !== 'review'}<p class="loading-note" role="status">
        {stage === 'youtube'
          ? 'Finding the sound…'
          : stage === 'spotify'
            ? 'Finding song information…'
            : 'Looking for the words…'}
      </p>{/if}
  {/if}
</section>
<VideoPreview
  video={preview}
  lyrics={previewLyrics}
  onclose={() => (preview = null)}
/>
